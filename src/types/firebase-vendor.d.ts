declare module 'firebase/app' {
  export interface FirebaseOptions {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
    firestoreDatabaseId?: string;
  }

  export interface FirebaseApp {
    readonly name: string;
    readonly options: FirebaseOptions;
  }

  export function initializeApp(options: FirebaseOptions, name?: string): FirebaseApp;
}

declare module 'firebase/auth' {
  import type { FirebaseApp } from 'firebase/app';

  export interface UserInfo {
    readonly displayName: string | null;
    readonly email: string | null;
    readonly phoneNumber: string | null;
    readonly photoURL: string | null;
    readonly providerId: string;
    readonly uid: string;
  }

  export interface User extends UserInfo {
    readonly emailVerified: boolean;
    readonly isAnonymous: boolean;
    readonly tenantId: string | null;
    readonly providerData: UserInfo[];
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }

  export interface Auth {
    readonly app: FirebaseApp;
    readonly currentUser: User | null;
  }

  export interface UserCredential {
    readonly user: User;
    readonly providerId: string | null;
    readonly operationType: string;
  }

  export class GoogleAuthProvider {
    providerId: string;
    constructor();
    setCustomParameters(customOAuthParameters: Record<string, string>): this;
  }

  export type Unsubscribe = () => void;

  export function getAuth(app?: FirebaseApp): Auth;
  export function signInWithPopup(auth: Auth, provider: GoogleAuthProvider): Promise<UserCredential>;
  export function signOut(auth: Auth): Promise<void>;
  export function onAuthStateChanged(
    auth: Auth,
    nextOrObserver: (user: User | null) => void,
    error?: (error: Error) => void,
    completed?: () => void
  ): Unsubscribe;
}

declare module 'firebase/firestore' {
  import type { FirebaseApp } from 'firebase/app';

  export interface Firestore {
    readonly app: FirebaseApp;
    readonly type: 'firestore-lite' | 'firestore';
  }

  export type DocumentData = Record<string, any>;

  export interface DocumentReference<T = DocumentData> {
    readonly id: string;
    readonly path: string;
    readonly firestore: Firestore;
  }

  export interface CollectionReference<T = DocumentData> {
    readonly id: string;
    readonly path: string;
    readonly firestore: Firestore;
  }

  export interface Query<T = DocumentData> {
    readonly firestore: Firestore;
  }

  export interface DocumentSnapshot<T = DocumentData> {
    readonly id: string;
    readonly ref: DocumentReference<T>;
    exists(): boolean;
    data(): T;
  }

  export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
    data(): T;
  }

  export interface QuerySnapshot<T = DocumentData> {
    readonly size: number;
    readonly empty: boolean;
    readonly docs: QueryDocumentSnapshot<T>[];
    forEach(callback: (result: QueryDocumentSnapshot<T>) => void): void;
  }

  export interface QueryConstraint {
    readonly type: string;
  }

  export interface FieldValue {
    isEqual(other: FieldValue): boolean;
  }

  export type WhereFilterOp =
    | '<'
    | '<='
    | '=='
    | '!='
    | '>='
    | '>'
    | 'array-contains'
    | 'in'
    | 'array-contains-any'
    | 'not-in';

  export type Unsubscribe = () => void;

  export function getFirestore(app: FirebaseApp, databaseId?: string): Firestore;
  export function getFirestore(databaseId?: string): Firestore;
  export function doc(firestore: Firestore, path: string, ...pathSegments: string[]): DocumentReference<DocumentData>;
  export function collection(firestore: Firestore, path: string, ...pathSegments: string[]): CollectionReference<DocumentData>;
  export function getDoc<T = DocumentData>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  export function getDocFromServer<T = DocumentData>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  export function getDocs<T = DocumentData>(query: Query<T> | CollectionReference<T>): Promise<QuerySnapshot<T>>;
  export function setDoc<T = DocumentData>(reference: DocumentReference<T>, data: T): Promise<void>;
  export function updateDoc<T = DocumentData>(reference: DocumentReference<T>, data: Partial<T> | Record<string, any>): Promise<void>;
  export function serverTimestamp(): FieldValue;
  export function where(fieldPath: string, opStr: WhereFilterOp, value: unknown): QueryConstraint;
  export function query<T = DocumentData>(query: Query<T> | CollectionReference<T>, ...queryConstraints: QueryConstraint[]): Query<T>;
  export function onSnapshot<T = DocumentData>(
    reference: Query<T> | CollectionReference<T>,
    onNext: (snapshot: QuerySnapshot<T>) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
}

declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };
  export const OPS: Record<string, number>;
  export function getDocument(src: { data: Uint8Array | ArrayBuffer } | string): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items: any[] }>;
        getViewport(params: { scale: number }): {
          width: number;
          height: number;
          convertToViewportRectangle(rect: number[]): number[];
        };
        getOperatorList(): Promise<{ fnArray: number[]; argsArray: any[][] }>;
        render(params: { canvasContext: any; viewport: any }): { promise: Promise<void> };
      }>;
    }>;
  };
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

declare module 'canvas-confetti' {
  const confetti: (options?: Record<string, any>) => Promise<null> | null;
  export default confetti;
}
