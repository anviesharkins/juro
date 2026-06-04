# Juro - Roblox Pack Scanner

Site em Node.js para colar um link/ID da Creator Store e listar a árvore do modelo junto com IDs usados dentro dele, como MeshId, Texture, SoundId, AnimationId e Image.

## Como rodar localmente

```bash
npm install
npm start
```

Abra:

```txt
http://localhost:3000
```

## Como subir no Railway

1. Conecte este repositório no Railway.
2. Use o comando de start padrão: `npm start`.
3. O Railway vai detectar a variável `PORT` automaticamente.

## Quando precisar de login

Alguns assets da Roblox podem responder 401/403 ou podem não liberar o arquivo do modelo sem autenticação. Nesse caso, crie uma variável no Railway:

```txt
ROBLOSECURITY=seu_cookie_aqui
```

Use isso com cuidado, porque esse cookie dá acesso à sua conta Roblox. Nunca coloque esse valor no GitHub.

## Limitação atual

Este MVP lê modelos que chegam em RBXMX/XML. Se a Roblox entregar o modelo como RBXM binário, o site vai avisar que precisa de parser binário. A interface e a API já estão prontas para essa próxima etapa.
