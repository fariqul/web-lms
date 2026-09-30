<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Log Viewer — {{ config('app.name') }}</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }

        .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 2.5rem 2rem;
            width: 100%;
            max-width: 380px;
            box-shadow: 0 25px 50px rgba(0,0,0,.5);
        }

        .logo {
            text-align: center;
            margin-bottom: 1.75rem;
        }

        .logo-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 52px;
            height: 52px;
            background: #3b82f6;
            border-radius: 12px;
            margin-bottom: .75rem;
        }

        .logo-icon svg { width: 28px; height: 28px; fill: white; }

        h1 {
            font-size: 1.25rem;
            font-weight: 700;
            color: #f1f5f9;
            margin-bottom: .25rem;
        }

        .subtitle {
            font-size: .8rem;
            color: #64748b;
        }

        .alert {
            background: #450a0a;
            border: 1px solid #7f1d1d;
            color: #fca5a5;
            padding: .75rem 1rem;
            border-radius: 8px;
            font-size: .85rem;
            margin-bottom: 1.25rem;
        }

        label {
            display: block;
            font-size: .8rem;
            font-weight: 600;
            color: #94a3b8;
            margin-bottom: .4rem;
            letter-spacing: .03em;
            text-transform: uppercase;
        }

        input[type="text"],
        input[type="password"] {
            width: 100%;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: .65rem .9rem;
            color: #f1f5f9;
            font-size: .95rem;
            outline: none;
            transition: border-color .15s;
            margin-bottom: 1rem;
        }

        input:focus { border-color: #3b82f6; }

        button {
            width: 100%;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            padding: .75rem;
            font-size: .95rem;
            font-weight: 600;
            cursor: pointer;
            transition: background .15s;
            margin-top: .25rem;
        }

        button:hover { background: #2563eb; }

        .env-badge {
            text-align: center;
            margin-top: 1.5rem;
            font-size: .75rem;
            color: #475569;
        }

        .env-badge span {
            background: #1e3a5f;
            color: #93c5fd;
            padding: .2rem .6rem;
            border-radius: 999px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">
            <div class="logo-icon">
                <svg viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>
            </div>
            <h1>Log Viewer</h1>
            <p class="subtitle">{{ config('app.name') }}</p>
        </div>

        @if (session('error'))
            <div class="alert">{{ session('error') }}</div>
        @endif

        <form method="POST" action="{{ route('log-viewer.login.post') }}">
            @csrf
            <label for="username">Username</label>
            <input
                type="text"
                id="username"
                name="username"
                value="{{ old('username') }}"
                autocomplete="username"
                autofocus
                required
            >

            <label for="password">Password</label>
            <input
                type="password"
                id="password"
                name="password"
                autocomplete="current-password"
                required
            >

            <button type="submit">Masuk →</button>
        </form>

        <div class="env-badge">
            Environment: <span>{{ config('app.env') }}</span>
        </div>
    </div>
</body>
</html>
