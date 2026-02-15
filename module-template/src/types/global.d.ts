/**
 * Global type declarations for Nekazari module integration
 */

declare global {
  interface Window {
    __nekazariModuleData?: {
      [moduleName: string]: {
        [key: string]: any;
      };
    };
    __nekazariUIKit?: any;
  }
}

export {};

