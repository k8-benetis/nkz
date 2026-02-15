// Type declarations for roslib
declare module 'roslib' {
  export class Ros {
    constructor(options: { url: string });
    on(event: 'connection' | 'error' | 'close', callback: (event?: any) => void): void;
    close(): void;
  }

  export class Topic {
    constructor(options: {
      ros: Ros;
      name: string;
      messageType: string;
    });
    publish(message: Message): void;
  }

  export class Service {
    constructor(options: {
      ros: Ros;
      name: string;
      serviceType: string;
    });
    callService(request: ServiceRequest, callback: (response: any) => void): void;
  }

  export class ServiceRequest {
    constructor(data?: any);
  }

  export class ActionClient {
    constructor(options: {
      ros: Ros;
      serverName: string;
      actionName: string;
    });
  }

  export class Goal {
    constructor(options: {
      actionClient: ActionClient;
      goalMessage: any;
    });
    on(event: 'feedback' | 'result' | 'status', callback: (data: any) => void): void;
    send(): void;
  }

  export class Message {
    constructor(data?: any);
  }

  export const ROSLIB: {
    Ros: typeof Ros;
    Topic: typeof Topic;
    Service: typeof Service;
    ServiceRequest: typeof ServiceRequest;
    ActionClient: typeof ActionClient;
    Goal: typeof Goal;
    Message: typeof Message;
  };
}

