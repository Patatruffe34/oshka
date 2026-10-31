// What the Functions' own middleware leaves on a request
declare global {
  namespace Express {
    interface Request {
      /** The signed-in Oshka account, once its ID token checked out */
      oshkaUid?: string;
      /** The Gmail capture credential, from the Authorization header */
      gmailToken?: string;
    }
  }
}

declare module "node:http" {
  interface IncomingMessage {
    /** The body as received, which Slack's signature covers */
    rawBody?: Buffer;
  }
}

export {};
