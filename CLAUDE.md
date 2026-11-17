# S'Kitty: guia para agentes de IA

Este projeto é um quadro de tarefas (React + Vite) com API em Netlify Functions.

## Usar o quadro de alguém pela API

O usuário te passa o endereço do site e o código do quadro (formato `SK-XXXX-XXXX`). O código é a chave: não há outra autenticação.

Base: `https://SEU-SITE.netlify.app/api`

| Ação | Requisição |
|---|---|
| Ler o quadro em texto | `GET /boards/{code}?format=md` |
| Ler em JSON | `GET /boards/{code}` |
| Mudar nome ou prazo do projeto | `PATCH /boards/{code}` com `{"name": "...", "due": "2026-12-20"}` |
| Criar tarefa | `POST /boards/{code}/cards` |
| Editar ou mover | `PATCH /boards/{code}/cards/{id}` |
| Apagar | `DELETE /boards/{code}/cards/{id}` |
| Criar coluna | `POST /boards/{code}/columns` com `{"name": "..."}` |
| Criar várias tarefas | `POST /boards/{code}/import` com `{"text": "..."}` |
| Especificação OpenAPI | `GET /openapi.json` |

Campos de tarefa (todos opcionais, menos `title` ao criar):

```json
{
  "title": "Desenhar o inimigo melee",
  "desc": "Silhueta primeiro, depois cor",
  "column": "A fazer",
  "tags": ["Arte"],
  "assignees": ["Gui"],
  "priority": 3,
  "due": "2026-12-01",
  "checklist": ["Rascunho", "Linha", "Cor"],
  "links": ["https://exemplo.com/referencia"],
  "done": false
}
```

- `column`, `tags` e `assignees` aceitam nomes. Etiquetas e pessoas que não existem são criadas.
- `priority`: 0 nenhuma, 1 baixa, 2 média, 3 alta.
- `due`: `AAAA-MM-DD` ou `""` para tirar o prazo.
- `"done": true` move para a coluna de concluídas.
- No PATCH, envie só o que muda.

Formato de texto do `import` (uma tarefa por linha):

```
## A fazer
- Desenhar cabeça do inimigo #Arte @Gui !alta prazo:2026-12-01
- Corrigir o dash #Codigo
```

Sempre leia o quadro (`?format=md`) antes de editar: os ids aparecem como `[id: ...]`.

## Desenvolvimento

- `npm run dev`: app sem API. `netlify dev`: app com API.
- `npm test`: testes do modelo em `scripts/test-model.mjs`.
- Regras de interface: sem emojis e sem travessão nos textos; ícones são SVG em `src/components/ui.jsx`.
- Mudanças de dados passam pelas funções de `shared/model.js` (elas cuidam de `updatedAt` para a sincronização).
