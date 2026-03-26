import fs from 'node:fs';
import path from 'node:path';

import Enquirer from 'enquirer';

import keyDB from '../src/keyDB';

const keyList = path.join(import.meta.dirname, '..', 'src', 'db', '3l.txt');
const keys = fs.readFileSync(keyList, 'utf8').split('\n').map(k => k.trim()).filter(k => k.length === 3);

const e = new Enquirer();

const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;

e.on('cancel', () => process.exit());

const main = async () => {
    const { action } = await e.prompt({
        name: 'action',
        type: 'select',
        message: 'select an action',
        choices: [
            { name: 'list', message: 'list keys' },
            { name: 'add', message: 'add a key' },
            { name: 'remove', message: 'remove a key' },
            { name: 'quit', message: 'quit' }
        ]
    }) as { action: string };

    if (action === 'list') {
        console.log(bold('key list:'));
        keyDB.db.forEach(k => console.log(`  ${green(k.name)} ${gray('->')} ${cyan(k.value)}`));
    } else if (action === 'add') {
        const { name } = await e.prompt({
            name: 'name',
            type: 'input',
            message: 'enter a name for the key (for your reference)'
        }) as { name: string };

        const value = keys[Math.floor(Math.random() * keys.length)] + '-' + keys[Math.floor(Math.random() * keys.length)];

        keyDB.add({ name, value: value.toUpperCase() });
        console.log(`added key: ${green(name)} ${gray('->')} ${cyan(value)}`);
    } else if (action === 'remove') {
        const { name } = await e.prompt({
            name: 'name',
            type: 'select',
            message: 'select a key to remove',
            choices: keyDB.db.map(k => ({ name: k.name, message: `${k.name} -> ${k.value}` }))
        }) as { name: string };

        keyDB.remove(k => k.name === name);
        console.log(`removed key with name: ${green(name)}`);
    } else if (action === 'quit') process.exit(0);

    main();
}

main();