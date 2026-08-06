import pg from "pg";
import { readFileSync } from "fs";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const today = new Date();
const fmt = (d) => d.toISOString().split("T")[0];
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function seed() {
  // 1. Company
  await q(`INSERT INTO companies (name, address, phone, email)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    ["Prairie Line Contractors", "1200 Industrial Blvd, Wichita, KS 67202", "(316) 555-0100", "office@prairielinecontractors.com"]);
  const [{ id: companyId }] = await q(`SELECT id FROM companies WHERE name=$1`, ["Prairie Line Contractors"]);
  console.log("Company ID:", companyId);

  // 2. Company members
  const members = [
    { email: "admin@prairielinecontractors.com", firstName: "Tom", lastName: "Braddock", role: "admin" },
    { email: "supervisor@prairielinecontractors.com", firstName: "Janet", lastName: "Krause", role: "supervisor" },
    { email: "foreman1@prairielinecontractors.com", firstName: "Dale", lastName: "Hutchins", role: "foreman" },
    { email: "foreman2@prairielinecontractors.com", firstName: "Marcus", lastName: "Webb", role: "foreman" },
  ];
  for (const m of members) {
    await q(`INSERT INTO company_memberships (company_id, email, first_name, last_name, role)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [companyId, m.email, m.firstName, m.lastName, m.role]);
  }

  // 3. Users (seed foremen without Clerk IDs — seed prefix)
  for (const m of members.filter(m => m.role === "foreman")) {
    await q(`INSERT INTO users (clerk_user_id, email, first_name, last_name)
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [`seed_${m.email}`, m.email, m.firstName, m.lastName]);
  }
  const [{ id: foreman1Id }] = await q(`SELECT id FROM users WHERE email=$1`, ["foreman1@prairielinecontractors.com"]);
  const [{ id: foreman2Id }] = await q(`SELECT id FROM users WHERE email=$1`, ["foreman2@prairielinecontractors.com"]);
  console.log("Foreman IDs:", foreman1Id, foreman2Id);

  // 4. Projects
  await q(`INSERT INTO projects (company_id, name, job_number, customer, work_location, status)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [companyId, "Southgate Substation Rebuild", "PLC-2026-001", "Evergy Kansas", "12th St & Oliver Ave, Wichita, KS", "active"]);
  await q(`INSERT INTO projects (company_id, name, job_number, customer, work_location, status)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [companyId, "Rural Distribution Upgrade - Sedgwick County", "PLC-2026-002", "Kansas Rural Electric", "County Rd 45, Sedgwick County, KS", "active"]);
  const [{ id: proj1Id }] = await q(`SELECT id FROM projects WHERE job_number=$1`, ["PLC-2026-001"]);
  const [{ id: proj2Id }] = await q(`SELECT id FROM projects WHERE job_number=$1`, ["PLC-2026-002"]);
  console.log("Project IDs:", proj1Id, proj2Id);

  // 5. Crews
  await q(`INSERT INTO crews (company_id, name, description, foreman_id)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [companyId, "Crew Alpha", "Transmission & substation work crew", foreman1Id]);
  await q(`INSERT INTO crews (company_id, name, description, foreman_id)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [companyId, "Crew Bravo", "Distribution line crew", foreman2Id]);
  const [{ id: crew1Id }] = await q(`SELECT id FROM crews WHERE name=$1 AND company_id=$2`, ["Crew Alpha", companyId]);
  const [{ id: crew2Id }] = await q(`SELECT id FROM crews WHERE name=$1 AND company_id=$2`, ["Crew Bravo", companyId]);
  console.log("Crew IDs:", crew1Id, crew2Id);

  // 6. Crew members
  const alpha = [
    { name: "Dale Hutchins", trade: "Journeyman Lineman", classification: "Foreman" },
    { name: "Rick Sandoval", trade: "Journeyman Lineman", classification: "Lead" },
    { name: "Tyler Okonkwo", trade: "Journeyman Lineman", classification: "Class A" },
    { name: "Brian Estes", trade: "Apprentice Lineman", classification: "5th Step" },
    { name: "Lee Carmichael", trade: "Equipment Operator", classification: "Class A" },
  ];
  const bravo = [
    { name: "Marcus Webb", trade: "Journeyman Lineman", classification: "Foreman" },
    { name: "Darnell Potts", trade: "Journeyman Lineman", classification: "Class A" },
    { name: "Sam Ferreira", trade: "Apprentice Lineman", classification: "4th Step" },
    { name: "Glen Whitmore", trade: "Equipment Operator", classification: "Class B" },
  ];
  for (const m of alpha) {
    await q(`INSERT INTO crew_members (crew_id, name, trade, classification) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [crew1Id, m.name, m.trade, m.classification]);
  }
  for (const m of bravo) {
    await q(`INSERT INTO crew_members (crew_id, name, trade, classification) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [crew2Id, m.name, m.trade, m.classification]);
  }
  console.log("Crew members inserted");

  // 7. Catalog materials
  const mats = [
    ["4/0 ACSR Conductor", "feet"], ["1/0 ACSR Conductor", "feet"], ["3/0 ACSR Conductor", "feet"],
    ["Wood Pole 40ft Class 3", "each"], ["Wood Pole 45ft Class 2", "each"], ["Wood Pole 50ft Class 1", "each"],
    ["Single Phase Transformer 25kVA", "each"], ["Three Phase Transformer 75kVA", "each"],
    ["Crossarm 8ft Southern Yellow Pine", "each"], ["Crossarm 10ft", "each"],
    ["Fiberglass Crossarm 8ft", "each"], ["Down Guy Wire 3/8in", "feet"],
    ["Anchor Rod 8ft", "each"], ["Insulator Porcelain Pin", "each"],
    ["Cutout 200A 15kV", "each"], ["Arrester Distribution 18kV", "each"],
    ["Primary Wire Splices", "each"], ["Secondary URD Cable 4/0", "feet"],
  ];
  for (const [name, unit] of mats) {
    await q(`INSERT INTO catalog_materials (company_id, name, unit) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [companyId, name, unit]);
  }

  // 8. Catalog equipment
  const equips = [
    ["Digger Derrick Truck #1", "Utility Truck"], ["Digger Derrick Truck #2", "Utility Truck"],
    ["Aerial Lift Bucket Truck #3", "Utility Truck"], ["Aerial Lift Bucket Truck #4", "Utility Truck"],
    ["Crane Service Truck #5", "Crane"], ["Backhoe CAT 420", "Heavy Equipment"],
    ["Crew Cab Pickup #8", "Light Vehicle"], ["Crew Cab Pickup #9", "Light Vehicle"],
    ["Pole Trailer #2", "Trailer"], ["Material Trailer #1", "Trailer"],
  ];
  for (const [name, type] of equips) {
    await q(`INSERT INTO catalog_equipment (company_id, name, type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [companyId, name, type]);
  }
  console.log("Catalog inserted");

  // 9. Daily reports
  const [r1] = await q(`INSERT INTO daily_reports
    (company_id, project_id, crew_id, foreman_id, report_date, status, work_location, general_foreman,
     start_time, stop_time, weather_conditions, work_performed, structures_installed,
     safety_meeting, outages, injuries, completed_at)
    VALUES ($1,$2,$3,$4,$5,'complete',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [companyId, proj1Id, crew1Id, foreman1Id, daysAgo(2),
     "12th & Oliver - Bay 3", "Tom Braddock", "06:30", "15:00", "Clear, 82F, light wind 8mph SW",
     "Set two 45ft class 2 wood poles in Bay 3 of Southgate substation yard. Installed three-phase crossarms and framing hardware on both poles. Strung 4/0 ACSR conductor between new poles and existing dead-end structure. Completed grounding on both poles.",
     "2 wood poles 45ft class 2, 2 three-phase crossarm assemblies, dead-end hardware",
     true, "Evergy outage 06:00-08:00 on feeder SG-3 for safe clearance", false,
     new Date(Date.now() - 2*86400000).toISOString()]);

  const [r2] = await q(`INSERT INTO daily_reports
    (company_id, project_id, crew_id, foreman_id, report_date, status, work_location, general_foreman,
     start_time, stop_time, weather_conditions, work_performed, structures_installed,
     safety_meeting, delays, injuries)
    VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [companyId, proj2Id, crew2Id, foreman2Id, daysAgo(1),
     "County Rd 45 - Sta 40+00 to 55+00", "Tom Braddock", "07:00", "16:30", "Partly cloudy, 75F, calm",
     "Framed 4 wood poles for single-phase distribution line rebuild. Installed crossarm assemblies and tie wires. Pulling wire scheduled for tomorrow after additional framing complete.",
     "4 wood poles 40ft class 3, 4 single-arm assemblies",
     true, "1.5 hour delay - late material delivery from supplier", false]);

  const [r3] = await q(`INSERT INTO daily_reports
    (company_id, project_id, crew_id, foreman_id, report_date, status, work_location, general_foreman,
     start_time, weather_conditions, work_performed, safety_meeting, injuries)
    VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [companyId, proj1Id, crew1Id, foreman1Id, daysAgo(0),
     "12th & Oliver - Bay 3", "Tom Braddock", "06:30", "Clear, 88F, hot",
     "Continuation of Bay 3 work. Setting transformer bank on new pole structure. Three-phase transformer 75kVA installation in progress.",
     true, false]);

  console.log("Reports:", r1.id, r2.id, r3.id);

  // 10. Time entries for report 1
  const te1 = [
    ["Dale Hutchins", "Journeyman Lineman", 8, 0.5, 0],
    ["Rick Sandoval", "Journeyman Lineman", 8, 0.5, 0],
    ["Tyler Okonkwo", "Journeyman Lineman", 8, 0.5, 0],
    ["Brian Estes", "Apprentice Lineman", 8, 0.5, 0],
    ["Lee Carmichael", "Equipment Operator", 8, 0.5, 0],
  ];
  for (const [name, trade, reg, ot, dt] of te1) {
    await q(`INSERT INTO time_entries (report_id, employee_name, trade, regular_hours, overtime_hours, double_time_hours) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r1.id, name, trade, reg, ot, dt]);
  }
  await q(`INSERT INTO report_materials (report_id, name, quantity, unit) VALUES ($1,$2,$3,$4)`, [r1.id, "Wood Pole 45ft Class 2", 2, "each"]);
  await q(`INSERT INTO report_materials (report_id, name, quantity, unit) VALUES ($1,$2,$3,$4)`, [r1.id, "Crossarm 10ft", 4, "each"]);
  await q(`INSERT INTO report_materials (report_id, name, quantity, unit) VALUES ($1,$2,$3,$4)`, [r1.id, "4/0 ACSR Conductor", 250, "feet"]);
  await q(`INSERT INTO report_equipment (report_id, name, hours_used) VALUES ($1,$2,$3)`, [r1.id, "Digger Derrick Truck #1", 6]);
  await q(`INSERT INTO report_equipment (report_id, name, hours_used) VALUES ($1,$2,$3)`, [r1.id, "Aerial Lift Bucket Truck #3", 5]);

  // 11. Time entries for report 2
  const te2 = [
    ["Marcus Webb", "Journeyman Lineman", 9.5, 0, 0],
    ["Darnell Potts", "Journeyman Lineman", 9.5, 0, 0],
    ["Sam Ferreira", "Apprentice Lineman", 9.5, 0, 0],
    ["Glen Whitmore", "Equipment Operator", 9.5, 0, 0],
  ];
  for (const [name, trade, reg, ot, dt] of te2) {
    await q(`INSERT INTO time_entries (report_id, employee_name, trade, regular_hours, overtime_hours, double_time_hours) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r2.id, name, trade, reg, ot, dt]);
  }
  await q(`INSERT INTO report_materials (report_id, name, quantity, unit) VALUES ($1,$2,$3,$4)`, [r2.id, "Wood Pole 40ft Class 3", 4, "each"]);
  await q(`INSERT INTO report_equipment (report_id, name, hours_used) VALUES ($1,$2,$3)`, [r2.id, "Digger Derrick Truck #2", 8]);

  // 12. Time entries for report 3 (in-progress/today)
  const te3 = [
    ["Dale Hutchins", "Journeyman Lineman", 4, 0, 0],
    ["Rick Sandoval", "Journeyman Lineman", 4, 0, 0],
    ["Tyler Okonkwo", "Journeyman Lineman", 4, 0, 0],
    ["Lee Carmichael", "Equipment Operator", 4, 0, 0],
  ];
  for (const [name, trade, reg, ot, dt] of te3) {
    await q(`INSERT INTO time_entries (report_id, employee_name, trade, regular_hours, overtime_hours, double_time_hours) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r3.id, name, trade, reg, ot, dt]);
  }
  await q(`INSERT INTO report_materials (report_id, name, quantity, unit) VALUES ($1,$2,$3,$4)`, [r3.id, "Three Phase Transformer 75kVA", 1, "each"]);
  await q(`INSERT INTO report_equipment (report_id, name, hours_used) VALUES ($1,$2,$3)`, [r3.id, "Crane Service Truck #5", 4]);
  await q(`INSERT INTO report_equipment (report_id, name, hours_used) VALUES ($1,$2,$3)`, [r3.id, "Aerial Lift Bucket Truck #4", 4]);

  console.log("SEED COMPLETE");
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
