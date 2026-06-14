declare const __DEV__: boolean;

declare const process: {
  env: Record<string, string | undefined>;
};

declare const global: typeof globalThis & {
  LitPlayWhisperCpp?: {
    validate?(input: {
      passageText: string;
      difficulty: string;
      audioBase64: string;
    }): Promise<import('@litplay/contracts').AsrResultPayload>;
    transcribe?(audioBase64: string): Promise<string>;
  };
};
