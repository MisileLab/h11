export {};

declare global {
  interface Window {
    __env?: {
      NEXT_PUBLIC_API_URL?: string;
    };
  }
}
