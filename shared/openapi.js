// Especificacao OpenAPI da API do S'Kitty. Serve para criar um GPT
// personalizado no ChatGPT (Actions) ou ligar qualquer agente de IA.

export function openApiSpec(origin) {
  const code = { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Código do quadro, formato SK-XXXX-XXXX" };
  const cardBody = {
    type: "object",
    properties: {
      title: { type: "string", description: "Título da tarefa" },
      desc: { type: "string", description: "Descrição" },
      column: { type: "string", description: "Nome ou id da coluna" },
      tags: { type: "array", items: { type: "string" }, description: "Nomes das etiquetas (criadas se não existirem)" },
      assignees: { type: "array", items: { type: "string" }, description: "Nomes das pessoas responsáveis" },
      priority: { type: "integer", minimum: 0, maximum: 3, description: "0 nenhuma, 1 baixa, 2 média, 3 alta" },
      due: { type: "string", description: "Prazo no formato AAAA-MM-DD, ou vazio" },
      checklist: { type: "array", items: { type: "string" } },
      links: { type: "array", items: { type: "string" } },
      done: { type: "boolean", description: "true move para a coluna de concluídas" },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "S'Kitty",
      version: "1.0.0",
      description: "Quadro de tarefas compartilhado. Leia o quadro em texto com getBoardText antes de editar.",
    },
    servers: [{ url: `${origin}/api` }],
    paths: {
      "/boards/{code}": {
        get: {
          operationId: "getBoardText",
          summary: "Lê o quadro inteiro em texto (colunas, tarefas, ids, prazos)",
          parameters: [code, { name: "format", in: "query", required: true, schema: { type: "string", enum: ["md"] } }],
          responses: { 200: { description: "Quadro em Markdown", content: { "text/markdown": { schema: { type: "string" } } } } },
        },
        patch: {
          operationId: "updateProject",
          summary: "Muda o nome e/ou o prazo de entrega do projeto",
          parameters: [code],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" }, due: { type: "string", description: "Prazo do projeto AAAA-MM-DD, ou vazio" } } },
              },
            },
          },
          responses: { 200: { description: "Projeto atualizado" } },
        },
      },
      "/boards/{code}/cards": {
        post: {
          operationId: "createCard",
          summary: "Cria uma tarefa",
          parameters: [code],
          requestBody: { required: true, content: { "application/json": { schema: { ...cardBody, required: ["title"] } } } },
          responses: { 201: { description: "Tarefa criada" } },
        },
      },
      "/boards/{code}/cards/{id}": {
        patch: {
          operationId: "updateCard",
          summary: "Edita ou move uma tarefa (envie só os campos que mudam)",
          parameters: [code, { name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: cardBody } } },
          responses: { 200: { description: "Tarefa atualizada" } },
        },
        delete: {
          operationId: "deleteCard",
          summary: "Apaga uma tarefa",
          parameters: [code, { name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Tarefa apagada" } },
        },
      },
      "/boards/{code}/import": {
        post: {
          operationId: "importTasks",
          summary: "Cria várias tarefas a partir de uma lista em texto",
          description: "Uma tarefa por linha: '- Título #Etiqueta @Pessoa !alta prazo:2026-12-01'. Linhas '## Coluna' escolhem a coluna.",
          parameters: [code],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["text"], properties: { text: { type: "string" }, column: { type: "string" } } } } },
          },
          responses: { 201: { description: "Tarefas criadas" } },
        },
      },
    },
  };
}
