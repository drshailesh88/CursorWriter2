/**
 * Supabase Mock
 *
 * Complete mock implementation of Supabase Auth and Database
 * for testing without connecting to real Supabase services.
 */

import { createMockUser, createMockDocument, type MockUser, type MockDocument } from './test-data';

// ============================================================
// Mock Timestamp
// ============================================================

export class MockTimestamp extends Date {
  public seconds: number;
  public nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    super(seconds * 1000 + nanoseconds / 1000000);
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  toDate(): Date {
    return new Date(this.getTime());
  }

  toMillis(): number {
    return this.getTime();
  }

  isEqual(other: MockTimestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds;
  }

  toJSON(key?: unknown): string {
    return super.toJSON();
  }

  toTimestampObject(): { seconds: number; nanoseconds: number } {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }

  static timestampNow(): MockTimestamp {
    const now = Date.now();
    return new MockTimestamp(Math.floor(now / 1000), (now % 1000) * 1000000);
  }

  static fromDate(date: Date): MockTimestamp {
    return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
  }
}

// ============================================================
// Mock Document Snapshot
// ============================================================

export class MockDocumentSnapshot {
  public ref: MockDocumentReference | null = null;
  private _exists: boolean;

  constructor(
    public id: string,
    private _data: Record<string, unknown> | null,
    exists: boolean = true,
    ref?: MockDocumentReference
  ) {
    this.ref = ref || null;
    this._exists = exists;
  }

  exists(): boolean {
    return this._exists;
  }

  data(): Record<string, unknown> | undefined {
    return this._exists ? this._data ?? undefined : undefined;
  }
}

// ============================================================
// Mock Query Snapshot
// ============================================================

export class MockQuerySnapshot {
  constructor(public docs: MockDocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (doc: MockDocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

// ============================================================
// Mock Document Reference
// ============================================================

export class MockDocumentReference {
  constructor(
    public id: string,
    public path: string,
    private store: MockDatabase
  ) {}

  async get(): Promise<MockDocumentSnapshot> {
    const data = this.store.getData(this.path);
    return new MockDocumentSnapshot(this.id, data, data !== null, this);
  }

  async set(data: Record<string, unknown>): Promise<void> {
    this.store.setData(this.path, { ...data, id: this.id });
  }

  async update(data: Record<string, unknown>): Promise<void> {
    const existing = this.store.getData(this.path);
    if (!existing) {
      throw new Error(`Document ${this.path} does not exist`);
    }
    this.store.setData(this.path, { ...existing, ...data });
  }

  async delete(): Promise<void> {
    this.store.deleteData(this.path);
  }

  collection(name: string): MockCollectionReference {
    return new MockCollectionReference(`${this.path}/${name}`, this.store);
  }

  onSnapshot(
    callback: (snapshot: MockDocumentSnapshot) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    // Immediately call with current data
    const data = this.store.getData(this.path);
    callback(new MockDocumentSnapshot(this.id, data, data !== null, this));

    // Set up listener for changes
    const unsubscribe = this.store.addListener(this.path, (newData) => {
      callback(new MockDocumentSnapshot(this.id, newData, newData !== null, this));
    });

    return unsubscribe;
  }
}

// ============================================================
// Mock Collection Reference
// ============================================================

export class MockCollectionReference {
  constructor(
    public path: string,
    private store: MockDatabase
  ) {}

  doc(id?: string): MockDocumentReference {
    const docId = id ?? this.store.generateId();
    return new MockDocumentReference(docId, `${this.path}/${docId}`, this.store);
  }

  async add(data: Record<string, unknown>): Promise<MockDocumentReference> {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }

  async get(): Promise<MockQuerySnapshot> {
    const docs = this.store.getCollection(this.path);
    return new MockQuerySnapshot(
      docs.map((doc) => {
        const docId = doc.id as string;
        const ref = new MockDocumentReference(docId, `${this.path}/${docId}`, this.store);
        return new MockDocumentSnapshot(docId, doc, true, ref);
      })
    );
  }

  where(field: string, operator: string, value: unknown): MockQuery {
    return new MockQuery(this.path, this.store, [{ field, operator, value }]);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): MockQuery {
    return new MockQuery(this.path, this.store, [], [{ field, direction }]);
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.path, this.store, [], [], count);
  }

  onSnapshot(
    callback: (snapshot: MockQuerySnapshot) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    // Immediately call with current data
    const docs = this.store.getCollection(this.path);
    callback(
      new MockQuerySnapshot(docs.map((doc) => {
        const docId = doc.id as string;
        const ref = new MockDocumentReference(docId, `${this.path}/${docId}`, this.store);
        return new MockDocumentSnapshot(docId, doc, true, ref);
      }))
    );

    // Set up listener
    const unsubscribe = this.store.addCollectionListener(this.path, (docs) => {
      callback(
        new MockQuerySnapshot(docs.map((doc) => {
          const docId = doc.id as string;
          const ref = new MockDocumentReference(docId, `${this.path}/${docId}`, this.store);
          return new MockDocumentSnapshot(docId, doc, true, ref);
        }))
      );
    });

    return unsubscribe;
  }
}

// ============================================================
// Mock Query
// ============================================================

export class MockQuery {
  constructor(
    private path: string,
    private store: MockDatabase,
    private filters: Array<{ field: string; operator: string; value: unknown }> = [],
    private orderBys: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
    private limitCount?: number
  ) {}

  where(field: string, operator: string, value: unknown): MockQuery {
    return new MockQuery(
      this.path,
      this.store,
      [...this.filters, { field, operator, value }],
      this.orderBys,
      this.limitCount
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): MockQuery {
    return new MockQuery(
      this.path,
      this.store,
      this.filters,
      [...this.orderBys, { field, direction }],
      this.limitCount
    );
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.path, this.store, this.filters, this.orderBys, count);
  }

  async get(): Promise<MockQuerySnapshot> {
    let docs = this.store.getCollection(this.path);

    // Apply filters
    for (const filter of this.filters) {
      docs = docs.filter((doc) => {
        const value = doc[filter.field] as any;
        const filterValue = filter.value as any;
        switch (filter.operator) {
          case '==':
            return value === filterValue;
          case '!=':
            return value !== filterValue;
          case '<':
            return value < filterValue;
          case '<=':
            return value <= filterValue;
          case '>':
            return value > filterValue;
          case '>=':
            return value >= filterValue;
          case 'array-contains':
            return Array.isArray(value) && value.includes(filterValue);
          default:
            return true;
        }
      });
    }

    // Apply ordering
    for (const orderBy of this.orderBys) {
      docs.sort((a, b) => {
        let aVal: any = a[orderBy.field];
        let bVal: any = b[orderBy.field];

        // Handle MockTimestamp objects by converting to dates
        if (aVal instanceof MockTimestamp) {
          aVal = aVal.toDate().getTime();
        }
        if (bVal instanceof MockTimestamp) {
          bVal = bVal.toDate().getTime();
        }

        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return orderBy.direction === 'asc' ? comparison : -comparison;
      });
    }

    // Apply limit
    if (this.limitCount) {
      docs = docs.slice(0, this.limitCount);
    }

    return new MockQuerySnapshot(
      docs.map((doc) => {
        const docId = doc.id as string;
        const ref = new MockDocumentReference(docId, `${this.path}/${docId}`, this.store);
        return new MockDocumentSnapshot(docId, doc, true, ref);
      })
    );
  }
}

// ============================================================
// Mock WriteBatch
// ============================================================

export class MockWriteBatch {
  private operations: Array<() => void> = [];

  constructor(private store: MockDatabase) {}

  set(ref: MockDocumentReference, data: Record<string, unknown>): this {
    this.operations.push(() => {
      this.store.setData(ref.path, { ...data, id: ref.id });
    });
    return this;
  }

  update(ref: MockDocumentReference, data: Record<string, unknown>): this {
    this.operations.push(() => {
      const existing = this.store.getData(ref.path);
      if (!existing) {
        throw new Error(`Document ${ref.path} does not exist`);
      }
      this.store.setData(ref.path, { ...existing, ...data });
    });
    return this;
  }

  delete(ref: MockDocumentReference): this {
    this.operations.push(() => {
      this.store.deleteData(ref.path);
    });
    return this;
  }

  async commit(): Promise<void> {
    // Execute all operations
    for (const operation of this.operations) {
      operation();
    }
    this.operations = [];
  }
}

// ============================================================
// Mock Database
// ============================================================

export class MockDatabase {
  private data: Map<string, Record<string, unknown>> = new Map();
  private listeners: Map<string, Set<(data: Record<string, unknown> | null) => void>> =
    new Map();
  private collectionListeners: Map<
    string,
    Set<(docs: Array<Record<string, unknown>>) => void>
  > = new Map();
  private idCounter = 0;
  private timestampOffset = 0; // Ensures unique timestamps in rapid operations

  collection(path: string): MockCollectionReference {
    return new MockCollectionReference(path, this);
  }

  doc(path: string): MockDocumentReference {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    return new MockDocumentReference(id, path, this);
  }

  writeBatch(): MockWriteBatch {
    return new MockWriteBatch(this);
  }

  generateId(): string {
    return `mock-id-${++this.idCounter}-${Date.now()}`;
  }

  getData(path: string): Record<string, unknown> | null {
    return this.data.get(path) ?? null;
  }

  setData(path: string, data: Record<string, unknown>): void {
    // Ensure unique timestamps by adding small offset for test reliability
    const processedData = { ...data };
    if (typeof processedData.createdAt === 'number') {
      processedData.createdAt += this.timestampOffset++;
    }
    if (typeof processedData.updatedAt === 'number') {
      processedData.updatedAt += this.timestampOffset;
    }

    this.data.set(path, processedData);
    this.notifyListeners(path, processedData);
    this.notifyCollectionListeners(path);
  }

  deleteData(path: string): void {
    this.data.delete(path);
    this.notifyListeners(path, null);
    this.notifyCollectionListeners(path);
  }

  getCollection(path: string): Array<Record<string, unknown>> {
    const docs: Array<Record<string, unknown>> = [];
    for (const [key, value] of this.data.entries()) {
      if (key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1) {
        docs.push(value);
      }
    }
    return docs;
  }

  addListener(
    path: string,
    callback: (data: Record<string, unknown> | null) => void
  ): () => void {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path)!.add(callback);
    return () => this.listeners.get(path)?.delete(callback);
  }

  addCollectionListener(
    path: string,
    callback: (docs: Array<Record<string, unknown>>) => void
  ): () => void {
    if (!this.collectionListeners.has(path)) {
      this.collectionListeners.set(path, new Set());
    }
    this.collectionListeners.get(path)!.add(callback);
    return () => this.collectionListeners.get(path)?.delete(callback);
  }

  private notifyListeners(path: string, data: Record<string, unknown> | null): void {
    this.listeners.get(path)?.forEach((cb) => cb(data));
  }

  private notifyCollectionListeners(docPath: string): void {
    const parts = docPath.split('/');
    const collectionPath = parts.slice(0, -1).join('/');
    const docs = this.getCollection(collectionPath);
    this.collectionListeners.get(collectionPath)?.forEach((cb) => cb(docs));
  }

  // Test utilities
  clear(): void {
    this.data.clear();
    this.listeners.clear();
    this.collectionListeners.clear();
    this.idCounter = 0;
  }

  seed(data: Record<string, Record<string, unknown>>): void {
    for (const [path, value] of Object.entries(data)) {
      this.data.set(path, value);
    }
  }
}

// ============================================================
// Supabase Browser Client Mock (table/query builder style)
// ============================================================

type Filter =
  | { type: 'eq'; field: string; value: unknown }
  | { type: 'in'; field: string; values: unknown[] }
  | { type: 'contains'; field: string; values: unknown[] };

type OrderBy = { field: string; ascending: boolean };
let mockSupabaseTimestampOffset = 0;

class MockSupabaseTableQuery {
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectedColumns = '*';
  private insertRows: Array<Record<string, unknown>> = [];
  private updatePayload: Record<string, unknown> = {};
  private filters: Filter[] = [];
  private orderBy?: OrderBy;
  private limitCount?: number;
  private expectSingle = false;

  constructor(
    private table: string,
    private store: MockDatabase
  ) {}

  select(columns: string = '*'): this {
    this.selectedColumns = columns;
    return this;
  }

  insert(rows: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.operation = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.operation = 'upsert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.operation = 'update';
    this.updatePayload = payload;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(field: string, value: unknown): this {
    this.filters.push({ type: 'eq', field, value });
    return this;
  }

  in(field: string, values: unknown[]): this {
    this.filters.push({ type: 'in', field, values });
    return this;
  }

  contains(field: string, values: unknown[]): this {
    this.filters.push({ type: 'contains', field, values });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this.orderBy = { field, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
    this.expectSingle = true;
    return this.execute() as Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
  }

  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
    this.expectSingle = true;
    return this.execute(true) as Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  private async execute(allowEmptySingle = false): Promise<{ data: unknown; error: Error | null }> {
    try {
      switch (this.operation) {
        case 'insert':
          return this.executeInsert();
        case 'upsert':
          return this.executeUpsert();
        case 'update':
          return this.executeUpdate();
        case 'delete':
          return this.executeDelete();
        case 'select':
        default:
          return this.executeSelect(allowEmptySingle);
      }
    } catch (error) {
      return {
        data: this.expectSingle ? null : [],
        error: error instanceof Error ? error : new Error('Mock query failed'),
      };
    }
  }

  private getTableRows(): Array<Record<string, unknown>> {
    return this.store.getCollection(this.table);
  }

  private matchesFilters(row: Record<string, unknown>): boolean {
    return this.filters.every((filter) => {
      const fieldValue = row[filter.field];
      if (filter.type === 'eq') {
        return fieldValue === filter.value;
      }
      if (filter.type === 'in') {
        return filter.values.includes(fieldValue);
      }
      if (filter.type === 'contains') {
        if (!Array.isArray(fieldValue)) return false;
        return filter.values.every((v) => fieldValue.includes(v));
      }
      return true;
    });
  }

  private applySelectColumns(row: Record<string, unknown>): Record<string, unknown> {
    if (!this.selectedColumns || this.selectedColumns.trim() === '*') {
      return row;
    }

    const keys = this.selectedColumns.split(',').map((k) => k.trim()).filter(Boolean);
    const selected: Record<string, unknown> = {};
    for (const key of keys) {
      selected[key] = row[key];
    }
    return selected;
  }

  private async executeSelect(allowEmptySingle: boolean): Promise<{ data: unknown; error: Error | null }> {
    let rows = this.getTableRows().filter((row) => this.matchesFilters(row));

    if (this.orderBy) {
      const { field, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        const cmp = aVal === bVal ? 0 : aVal! > bVal! ? 1 : -1;
        return ascending ? cmp : -cmp;
      });
    }

    if (typeof this.limitCount === 'number') {
      rows = rows.slice(0, this.limitCount);
    }

    if (this.expectSingle) {
      if (rows.length === 0) {
        return { data: null, error: allowEmptySingle ? null : new Error('No rows found') };
      }
      return { data: this.applySelectColumns(rows[0]), error: null };
    }

    return { data: rows.map((row) => this.applySelectColumns(row)), error: null };
  }

  private async executeInsert(): Promise<{ data: unknown; error: Error | null }> {
    const insertedRows = this.insertRows.map((row) => {
      const id = (row.id as string | undefined) || this.store.generateId();
      const createdAt = new Date(Date.now() + mockSupabaseTimestampOffset++).toISOString();
      const normalized = {
        ...row,
        id,
        created_at: row.created_at || createdAt,
        updated_at: row.updated_at || createdAt,
      };
      this.store.setData(`${this.table}/${id}`, normalized as Record<string, unknown>);
      return normalized;
    });

    if (this.expectSingle) {
      return { data: this.applySelectColumns(insertedRows[0]), error: null };
    }
    return { data: insertedRows.map((row) => this.applySelectColumns(row)), error: null };
  }

  private async executeUpsert(): Promise<{ data: unknown; error: Error | null }> {
    const upsertedRows = this.insertRows.map((row) => {
      const explicitId = row.id as string | undefined;
      const existingById = explicitId ? this.store.getData(`${this.table}/${explicitId}`) : null;
      const existing = existingById ?? null;
      const id = explicitId || String(existing?.id ?? this.store.generateId());
      const now = new Date(Date.now() + mockSupabaseTimestampOffset++).toISOString();

      const normalized = {
        ...(existing || {}),
        ...row,
        id,
        created_at: (existing?.created_at as string | undefined) || (row.created_at as string | undefined) || now,
        updated_at: (row.updated_at as string | undefined) || now,
      };

      this.store.setData(`${this.table}/${id}`, normalized as Record<string, unknown>);
      return normalized;
    });

    if (this.expectSingle) {
      return { data: this.applySelectColumns(upsertedRows[0]), error: null };
    }
    return { data: upsertedRows.map((row) => this.applySelectColumns(row)), error: null };
  }

  private async executeUpdate(): Promise<{ data: unknown; error: Error | null }> {
    const rows = this.getTableRows().filter((row) => this.matchesFilters(row));
    const updatedRows = rows.map((row) => {
      const id = String(row.id);
      const next = {
        ...row,
        ...this.updatePayload,
        updated_at: new Date().toISOString(),
      };
      this.store.setData(`${this.table}/${id}`, next as Record<string, unknown>);
      return next;
    });

    if (this.expectSingle) {
      return { data: updatedRows[0] || null, error: updatedRows.length ? null : new Error('No rows found') };
    }
    return { data: updatedRows, error: null };
  }

  private async executeDelete(): Promise<{ data: unknown; error: Error | null }> {
    const rows = this.getTableRows().filter((row) => this.matchesFilters(row));
    for (const row of rows) {
      const id = String(row.id);
      this.store.deleteData(`${this.table}/${id}`);
    }
    return { data: null, error: null };
  }
}

class MockSupabaseBrowserClient {
  constructor(private store: MockDatabase) {}

  from(table: string): MockSupabaseTableQuery {
    return new MockSupabaseTableQuery(table, this.store);
  }

  channel(name: string) {
    return {
      on: () => this.channel(name),
      subscribe: () => ({ name }),
    };
  }

  removeChannel(_channel?: unknown): void {
    // no-op for tests
  }
}

// ============================================================
// Mock Auth
// ============================================================

export class MockAuth {
  currentUser: MockUser | null = null;
  private listeners: Set<(user: MockUser | null) => void> = new Set();
  private error: Error | null = null;

  async signInWithPopup(): Promise<{ user: MockUser }> {
    if (this.error) {
      const err = this.error;
      this.error = null;
      throw err;
    }
    this.currentUser = createMockUser();
    this.notifyListeners();
    return { user: this.currentUser };
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    this.notifyListeners();
  }

  onAuthStateChanged(callback: (user: MockUser | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb(this.currentUser));
  }

  // Test utilities
  setUser(user: MockUser | null): void {
    this.currentUser = user;
    this.notifyListeners();
  }

  setError(error: Error): void {
    this.error = error;
  }

  consumeError(): Error | null {
    const current = this.error;
    this.error = null;
    return current;
  }

  clear(): void {
    this.currentUser = null;
    this.listeners.clear();
    this.error = null;
  }
}

// ============================================================
// Singleton Instances
// ============================================================

export const mockDatabase = new MockDatabase();
export const mockAuth = new MockAuth();
export const mockSupabaseBrowserClient = new MockSupabaseBrowserClient(mockDatabase);

// ============================================================
// Jest Mock Factory
// ============================================================

export function createSupabaseMock() {
  return {
    auth: mockAuth,
    db: mockDatabase,
    getSupabaseBrowserClient: () => mockSupabaseBrowserClient,
    Timestamp: MockTimestamp,
  };
}

// Reset function for use in beforeEach
export function resetSupabaseMocks(): void {
  mockDatabase.clear();
  mockAuth.clear();
  mockSupabaseTimestampOffset = 0;
}
