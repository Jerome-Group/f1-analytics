// The stores, in a JSON file, so that the MongoDB snippets in `bin/lib/mongo.sh` can be run and
// their effect asserted without a MongoDB — and therefore without the container stack, which no
// test may reach (`CODING_STANDARDS.md`, ADR-0004).
//
//   node test/lib/mongo-store.ts /tmp/stores.json <<<'print(db.laps.countDocuments({}))'
//
// The file is one array of documents per collection; it is read before the snippet runs and
// written after it, so a sequence of snippets composes the way a sequence of `mongosh --eval`
// calls does. What `print()` is given goes to stdout, one line per call.
//
// Only what bin/lib/mongo.sh asks of MongoDB is implemented, and equality and `$exists` are the
// whole query language. A snippet that needs more than this has outgrown the fake.

import { readFileSync, writeFileSync } from 'node:fs';

type Document = Record<string, unknown>;
type Store = Record<string, Document[]>;
type Filter = Record<string, unknown>;
type Update = { $set?: Document; $unset?: Document };

const matches = (document: Document, filter: Filter): boolean =>
  Object.entries(filter).every(([field, condition]) => {
    if (typeof condition === 'object' && condition !== null && '$exists' in condition) {
      return field in document === (condition as { $exists: boolean }).$exists;
    }
    return document[field] === condition;
  });

class Collection {
  readonly store: Store;
  readonly name: string;

  constructor(store: Store, name: string) {
    this.store = store;
    this.name = name;
  }

  get documents(): Document[] {
    return this.store[this.name] ?? [];
  }

  createIndex(): string {
    return this.name;
  }

  countDocuments(filter: Filter): number {
    return this.documents.filter((document) => matches(document, filter)).length;
  }

  findOne(filter: Filter): Document | null {
    return this.documents.find((document) => matches(document, filter)) ?? null;
  }

  insertMany(documents: Document[]): { insertedCount: number } {
    this.store[this.name] = [...this.documents, ...documents];
    return { insertedCount: documents.length };
  }

  deleteMany(filter: Filter): { deletedCount: number } {
    const kept = this.documents.filter((document) => !matches(document, filter));
    const deletedCount = this.documents.length - kept.length;
    if (deletedCount > 0) this.store[this.name] = kept;
    return { deletedCount };
  }

  updateMany(filter: Filter, update: Update): { matchedCount: number } {
    const matched = this.documents.filter((document) => matches(document, filter));
    for (const document of matched) {
      Object.assign(document, update.$set ?? {});
      for (const field of Object.keys(update.$unset ?? {})) delete document[field];
    }
    return { matchedCount: matched.length };
  }

  // The one aggregation used: what the collection occupies on disk. A document is a hundred bytes
  // here, which is a number and not a measurement — `docs/measurements/` is where the real ones
  // are, taken from a real store.
  aggregate(): { next: () => { storageStats: { storageSize: number } } } {
    return { next: () => ({ storageStats: { storageSize: this.documents.length * 100 } }) };
  }
}

const [storePath, ...rest] = process.argv.slice(2);
if (storePath === undefined || rest.length > 0) {
  process.stderr.write('usage: node test/lib/mongo-store.ts <store.json>  # snippet on stdin\n');
  process.exit(64);
}

const store: Store = JSON.parse(readFileSync(storePath, 'utf8'));

const db = new Proxy(
  {
    getCollectionNames: (): string[] => Object.keys(store),
  },
  {
    get: (target: object, name: string | symbol): unknown =>
      name in target || typeof name !== 'string'
        ? Reflect.get(target, name)
        : new Collection(store, name),
  },
);

let snippet = '';
for await (const chunk of process.stdin) snippet += chunk;

const print = (line: unknown): void => {
  process.stdout.write(`${line}\n`);
};

new Function('db', 'print', snippet)(db, print);

writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
