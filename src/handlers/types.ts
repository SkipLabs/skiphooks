export interface FormattedEvent {
  markdown: string;
}

export interface EventHandler {
  isRelevantAction(action: string | undefined): boolean;
  format(payload: unknown): FormattedEvent;
}
