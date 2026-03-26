(() => {
    let inferredRoot = '';

    if (document.currentScript) {
        inferredRoot = new URL(document.currentScript.src).origin;
        document.currentScript.remove();
    } else console.warn('[qapi] could not infer root; qapi.setRoot must be set manually');

    class qapi {
        isAuthorized = false;
        authCallbacks = [];
        accessCode = '';
        qapiRoot = inferredRoot;

        constructor() {
            console.log('[qapi] loaded!');
        }

        setRoot(root) {
            this.qapiRoot = root;
        }

        requestCode() {
            if (!this.qapiRoot) throw new Error('qapi root not set');
            if (this.isAuthorized) return;

            if (localStorage.getItem('qapiAccessCode')) {
                this.accessCode = localStorage.getItem('qapiAccessCode');
                this.isAuthorized = true;
                this.authCallbacks.forEach((cb) => cb());

                return fetch(this.qapiRoot + '/api/v1/valid?key=' + this.accessCode, { method: 'POST' }).then(r => r.json()).then(r => {
                    if (!r.exists) {
                        localStorage.removeItem('qapiAccessCode');
                        this.accessCode = '';
                        this.isAuthorized = false;
                        this.requestCode();
                    }
                });
            }

            fetch(this.qapiRoot + '/sdk/code.html').then(r => r.text()).then(html => {
                const c = document.createElement('div');
                c.style.position = 'absolute';
                c.style.height = '100vh';
                c.style.width = '100%';
                c.style.top = '0px';
                c.style.left = '0px';
                c.style.overflow = 'hidden';
                c.style.display = 'flex';
                c.style.justifyContent = 'center';
                c.style.alignItems = 'center';
                c.style.filter = 'drop-shadow(rgba(0, 0, 0, 0.1) 0px 0px 60px)';
                c.style.background = 'rgba(0, 0, 0, 0.5)';
                c.style.zIndex = '999999999999999999';
                document.body.appendChild(c);

                const root = c.attachShadow({ mode: 'open' });
                root.innerHTML = html;

                const qapiStyle = document.createElement('link');
                qapiStyle.rel = 'stylesheet';
                qapiStyle.href = this.qapiRoot + '/tailwind.css';
                root.appendChild(qapiStyle);

                root.querySelectorAll('input').forEach((i) => {
                    i.onkeydown = (e) => {
                        if (root.querySelector('.text-red-500').innerText === 'invalid key :<')
                            root.querySelector('.text-red-500').style.display = 'none';

                        if (!(/[A-z]/.test(e.key)) || e.key.length > 1) {
                            e.preventDefault();

                            if (e.key === 'Backspace') requestAnimationFrame(() => {
                                if (i.value) i.value = '';
                                else {
                                    i.value = i.value.toUpperCase();
                                    const num = Number(i.id.charAt(4));
                                    if (num !== 1) {
                                        root.querySelector(`#code${num - 1}`).focus();
                                        root.querySelector(`#code${num - 1}`).value = '';
                                    }
                                }
                            });
                        } else requestAnimationFrame(() => {
                            i.value = i.value.toUpperCase();
                            const num = Number(i.id.charAt(4));
                            if (num === 6) root.querySelector('button').click();
                            else root.querySelector(`#code${num + 1}`).focus();
                        });
                    }
                });

                root.querySelector('button').onclick = () => {
                    const inputValues = [...root.querySelectorAll('input')].map(e => e.value).join('');
                    const data = inputValues.slice(0, 3) + '-' + inputValues.slice(3, 6);

                    fetch(this.qapiRoot + '/api/v1/valid?key=' + data, { method: 'POST' }).then(r => r.json()).then(r => {
                        if (r.exists) {
                            localStorage.setItem('qapiAccessCode', data);
                            this.accessCode = data;
                            this.authCallbacks.forEach((cb) => cb());
                            c.remove();
                        } else {
                            root.querySelector('.text-red-500').innerHTML = 'invalid key :<';
                            root.querySelector('.text-red-500').style.display = '';
                        }
                    });
                }
            });
        }

        onAuthorize(callback) {
            if (!this.qapiRoot) throw new Error('qapi root not set');
            this.authCallbacks.push(callback);
        }

        async mcq(question, answers) {
            if (!this.qapiRoot) throw new Error('qapi root not set');
            const req = await fetch(this.qapiRoot + '/api/v1/mcq', {
                method: 'POST',
                headers: { 'Authorization': this.accessCode, 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answers })
            });

            const res = await req.json();
            if (!req.ok) throw new Error(res.error || 'Unknown error');
            return res.answer;
        }
    }

    const sdk = new qapi();
    window.qapi = sdk;
})();