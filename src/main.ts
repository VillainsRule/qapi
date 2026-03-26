import Elysia, { t } from 'elysia';
import cors from '@elysiajs/cors';

import path from 'node:path';

import keyDB from './keyDB';

const prepareRequest = async ({ question, answers }: { question: string, answers: string[] }): Promise<string> => {
    const stripHtml = (str: string) =>
        str.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

    const cleanQuestion = stripHtml(question).replace(/"/g, '\\"');

    const req = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
            model: 'deepseek-chat',
            stream: false,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at answering multiple choice questions accurately. Always respond in JSON.'
                },
                {
                    role: 'user',
                    content: [
                        'In "thoughts": briefly reason step by step through each answer choice, eliminating wrong ones and justifying the correct one. Do not repeat the question or answer choices; refer to them as "Option __". Do not get into an infinite thinking loop.',
                        'In "answer": output ONLY the index number (1-based) of the correct answer.',
                        '',
                        `Question: ${cleanQuestion}`,
                        '',
                        `Answer choices:\n${answers.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
                    ].join('\n')
                }
            ],
            response_format: { type: 'json_object' }
        }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        }
    });

    const json = await req.json();
    const data = json.choices[0].message.content;
    const parsed = JSON.parse(data);
    return JSON.stringify(parsed);
}

new Elysia()
    .use(cors())

    .get('/', () => Bun.file(path.join(import.meta.dirname, 'ui', 'welcome.html')))
    .get('/tailwind.css', () => Bun.file(path.join(import.meta.dirname, 'ui', 'tailwind.css')))

    .get('/sdk.js', () => Bun.file(path.join(import.meta.dirname, 'sdk', 'sdk.js')))
    .get('/sdk/code.html', () => Bun.file(path.join(import.meta.dirname, 'sdk', 'code.html')))

    .post('/api/v1/valid', ({ query }) => ({ exists: keyDB.some(k => k.value === query.key) }), { query: t.Object({ key: t.String() }) })

    .post('/api/v1/mcq', async ({ body, headers }) => {
        const authHeader = headers['authorization'];
        if (!authHeader) return { error: 'Unauthorized' };
        if (!keyDB.some(k => k.value === authHeader)) return { error: 'Unauthorized' };

        const data = await prepareRequest({ question: body.question, answers: body.answers });
        return new Response(data as any, { headers: { 'content-type': 'application/json' } });
    }, {
        headers: t.Object({ authorization: t.String() }),
        body: t.Object({ question: t.String(), answers: t.Array(t.String()), stream: t.Optional(t.Boolean()) })
    })

    .listen(4402, () => console.log('$ http://localhost:4402'))