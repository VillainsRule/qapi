import fs from 'node:fs';
import path from 'node:path';

interface DBCode {
    name: string;
    value: string;
}

const dbDir = path.join(import.meta.dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

class KeyDB {
    dbPath = path.join(dbDir, 'key.db');
    db: DBCode[] = [];

    constructor() {
        if (!fs.existsSync(this.dbPath)) {
            if (Bun.env.IS_DEV) this.add({ name: 'test', value: 'CAT-DOG' });
            this.save();
        }

        this.db = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    }

    add(item: DBCode): void {
        this.db.push(item);
        this.save();
    }

    some(fn: (item: DBCode) => boolean): boolean {
        return this.db.some(fn);
    }

    find(fn: (item: DBCode) => boolean): DBCode | undefined {
        return this.db.find(fn);
    }

    filter(fn: (item: DBCode) => boolean): DBCode[] {
        return this.db.filter(fn);
    }

    remove(fn: (item: DBCode) => boolean): void {
        this.db = this.db.filter(i => !fn(i));
        this.save();
    }

    save() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.db));
    }
}

const keyDB = new KeyDB();
export default keyDB;