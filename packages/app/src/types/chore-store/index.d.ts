declare module '@docker/njs/chore-store.js' {
  interface NjsChoreRequest {
    method: string;
    uri?: string;
    headersIn?: Record<string, string | undefined>;
    headersOut: Record<string, string>;
    requestText?: string;
    return: (status: number, body?: string) => void;
  }

  interface ChorePrincipal {
    providerId: string;
    tenantId: string;
    sessionId: string;
    userId: string | null;
    userName: string | null;
  }

  interface ChoreStoreModule {
    getNjsTimeZoneOffsetMinutesForTests(timestamp: number, timeZone: string): number;
    handle(request: NjsChoreRequest): void;
    handleIngress(request: NjsChoreRequest): void;
    isValidChoreWorkspaceData(value: unknown): boolean;
    materializeDefinitionForTests(
      definition: Record<string, unknown>,
      participantsById: Record<string, Record<string, unknown>>,
      rangeStart: string,
      rangeEnd: string,
      existingOccurrences: Record<string, unknown>,
      latestCompletedAt?: string,
      materializeNextAfterCompletion?: boolean
    ): Array<{ id: string; scheduledAt: string; assigneeIds: string[] }>;
    resetChoreStoreForTests(): void;
    routeRequest(request: NjsChoreRequest, principal: ChorePrincipal): void;
    runPeriodic(session: unknown): Promise<void>;
    setChoreStoreFsForTests(mockFs: {
      statSync: (path: string) => { size: number };
      readFileSync: (path: string, encoding?: string) => string;
      writeFileSync: (path: string, content: string, encoding?: string) => void;
      renameSync: (sourcePath: string, destinationPath: string) => void;
    }): void;
    setChoreStorePrincipalResolverForTests(
      resolver: (
        request: NjsChoreRequest,
        options: { trustIngressHeaders: boolean }
      ) => ChorePrincipal | null
    ): void;
  }

  const choreStore: ChoreStoreModule;
  export default choreStore;
}
