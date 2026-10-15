// Shares ordered concurrency and use-case scoping across generation pipelines.
import type { DiagramModelSpec } from "@uml-platform/contracts";

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function useCaseModelForSingleUseCase(
  useCaseModel: DiagramModelSpec,
  sourceUseCaseId: string,
) {
  if (useCaseModel.diagramKind !== "usecase") return useCaseModel;
  const useCase = useCaseModel.useCases.find((item) => item.id === sourceUseCaseId);
  if (!useCase) return useCaseModel;
  return {
    ...useCaseModel,
    useCases: [useCase],
    relationships: useCaseModel.relationships.filter(
      (relationship) =>
        relationship.sourceId === sourceUseCaseId ||
        relationship.targetId === sourceUseCaseId,
    ),
  };
}
