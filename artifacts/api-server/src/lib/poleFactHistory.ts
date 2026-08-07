export interface ConfirmedPoleFact<T = unknown> {
  id: number;
  photoId: number;
  analysisRunId: number;
  analysisVersion: number;
  fieldKey: string;
  value: T;
  decisionAction: string;
  confirmedByUserId: number;
  confirmedAt: Date;
}

export interface SupersededPoleFact<T = unknown> extends ConfirmedPoleFact<T> {
  supersededByFactId: number;
}

export function partitionPoleFactHistory<T>(factsNewestFirst: ConfirmedPoleFact<T>[]) {
  const currentFacts: ConfirmedPoleFact<T>[] = [];
  const history: SupersededPoleFact<T>[] = [];
  const nextFactByField = new Map<string, number>();

  for (const fact of factsNewestFirst) {
    const identity = `${fact.photoId}:${fact.fieldKey}`;
    const supersededByFactId = nextFactByField.get(identity);
    if (supersededByFactId === undefined) currentFacts.push(fact);
    else history.push({ ...fact, supersededByFactId });
    nextFactByField.set(identity, fact.id);
  }

  return {
    currentFacts,
    history,
    currentFactCount: currentFacts.length,
    historyFactCount: history.length,
  };
}
