import Elysia, { t } from 'elysia';
import cors from '@elysiajs/cors';
import openapi from '@elysiajs/openapi';

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

    if (json.choices) {
        const data = json.choices[0].message.content;
        return JSON.stringify(JSON.parse(data));
    } else {
        console.error('unexpected response from DeepSeek API:', json);
        return JSON.stringify({ error: 'deepseek failed' });
    }
}

const mainElysia = new Elysia({ name: 'main' })
    .guard({ detail: { hide: true } })

    .get('/', () => Bun.file(path.join(import.meta.dirname, 'ui', 'welcome.html')))
    .get('/tailwind.css', () => Bun.file(path.join(import.meta.dirname, 'ui', 'tailwind.css')))

    .get('/sdk.js', () => Bun.file(path.join(import.meta.dirname, 'sdk', 'sdk.js')))
    .get('/sdk/code.html', () => Bun.file(path.join(import.meta.dirname, 'sdk', 'code.html')))

    .get('/robots.txt', () => new Response('User-agent: *\nDisallow: /', { headers: { 'Content-Type': 'text/plain' } }))

const apiElysia = new Elysia({ name: 'api' })
    .use(openapi({
        path: '/docs',
        documentation: {
            info: {
                title: 'qapi docs',
                version: 'v1'
            }
        },
        provider: 'scalar',
        scalar: {
            agent: { disabled: true },
            mcp: { disabled: true },
            hideClientButton: true,
            hideDarkModeToggle: true,
            telemetry: false,
            withDefaultFonts: false,
            metaData: {
                title: 'qapi docs',
                description: 'qapi: a simple and quick question & answer API',
                ogDescription: 'qapi: a simple and quick question & answer API'
            },
            defaultHttpClient: {
                targetKey: 'javascript',
                clientKey: 'fetch',
            },
            expandAllResponses: true,
            documentDownloadType: 'json',
            persistAuth: true,
            theme: 'deepSpace',
            customCss: ''
        }
    }))

    .post('/api/v1/valid', ({ query }) => ({ exists: keyDB.some(k => k.value === query.key) }), { query: t.Object({ key: t.String() }) })

    .post('/api/v1/runner/java', async ({ body, headers }) => {
        const authHeader = headers['authorization'];
        if (!authHeader) return { error: 'Unauthorized' };
        if (!keyDB.some(k => k.value === authHeader)) return { error: 'Unauthorized' };

        const idReq = await fetch('https://onecompiler.com/api/getIdAndToken');
        const idRes = await idReq.json();

        const modFiles = body.files.map((f) => {
            if (f.name === 'Main.java' && !f.content.includes('public static void main'))
                return { name: f.name, content: `public class Main {\npublic static void main(String[] args) {\n${f.content}\n}\n}` };

            return f;
        });

        const execReq = await fetch('https://onecompiler.com/api/code/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                active: true,
                concurrentJobs: 2,
                console: true,
                description: null,
                extension: 'java',
                idToken: idRes.token,
                languageType: 'programming',
                mode: 'java',
                name: 'Java',
                properties: {
                    cheatsheats: true,
                    docs: true,
                    files: modFiles,
                    filesDeletable: true,
                    filesEditable: true,
                    language: 'java',
                    newFileOptions: [],
                    tutorials: false
                },
                title: idRes.id,
                user: null,
                version: '11',
                visibility: 'public',
                _id: idRes.id
            })
        });

        const execRes = await execReq.json() as { stdout: string, stderr: string };
        return { stdout: execRes.stdout, stderr: execRes.stderr };
    }, {
        headers: t.Object({ authorization: t.String() }),
        body: t.Object({ files: t.Array(t.Object({ name: t.String(), content: t.String() })) }),
        detail: { description: 'execute java code in a sandboxed environment. returns the system output.' }
    })

    .post('/api/v1/ocr', async ({ body, headers }) => {
        const authHeader = headers['authorization'];
        if (!authHeader) return { error: 'Unauthorized' };
        if (!keyDB.some(k => k.value === authHeader)) return { error: 'Unauthorized' };

        if (!Bun.env.MISTRAL_API_KEY) return { error: 'MISTRAL_API_KEY not set' };
        const mistralKeys = Bun.env.MISTRAL_API_KEY.split(',').map(k => k.trim()).filter(k => k);
        if (mistralKeys.length === 0) return { error: 'No MISTRAL_API_KEY provided' };

        const req = await fetch('https://api.mistral.ai/v1/ocr', {
            method: 'POST',
            body: JSON.stringify({
                document: {
                    image_url: {
                        detail: 'auto',
                        url: body.imageURL
                    }
                },
                model: 'mistral-ocr-latest'
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mistralKeys[Math.floor(Math.random() * mistralKeys.length)]}`
            }
        });

        const json = await req.json();
        const markdown = json.pages[0].markdown.split('\n');
        if (markdown[0].trim() === '```') markdown.shift();
        if (markdown[markdown.length - 1].trim() === '```') markdown.pop();
        return { text: markdown.join('\n').trim().replaceAll('&lt;', '<').replaceAll('&gt;', '>') };
    }, {
        headers: t.Object({ authorization: t.String() }),
        body: t.Object({ imageURL: t.String() }),
        detail: { description: 'extract text from an image using OCR' }
    })

    .post('/api/v1/mcq', async ({ body, headers }) => {
        const authHeader = headers['authorization'];
        if (!authHeader) return { error: 'Unauthorized' };
        if (!keyDB.some(k => k.value === authHeader)) return { error: 'Unauthorized' };

        const data = await prepareRequest({ question: body.question, answers: body.answers });
        return new Response(data as any, { headers: { 'content-type': 'application/json' } });
    }, {
        headers: t.Object({ authorization: t.String() }),
        body: t.Object({ question: t.String(), answers: t.Array(t.String()) }),
        detail: { description: 'answer a multiple choice question. returns the index (1-based) of the correct answer.' }
    })

new Elysia()
    .use(cors())
    .use(apiElysia)
    .use(mainElysia)
    .listen(4402, () => console.log('$ http://localhost:4402'))