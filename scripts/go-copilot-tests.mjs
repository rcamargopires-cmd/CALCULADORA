import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../services/goCopilotReadOnly.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getGoGuidance } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const tasks = [
  { title: 'Retornar para cliente', reason: 'Retorno prometido', dueLabel: 'Hoje às 15h', urgent: true },
  { title: 'Conferir proposta', reason: 'Negociação em aberto', dueLabel: 'Amanhã', urgent: false },
];

assert.match(getGoGuidance('O que faço agora?', tasks, tasks[0], 'crm'), /Retornar para cliente/);
assert.match(getGoGuidance('Resuma minhas pendências', tasks, tasks[0], 'crm'), /2 pendência/);
assert.match(getGoGuidance('Por que esta prioridade?', tasks, tasks[0], 'crm'), /Retorno prometido/);
assert.match(getGoGuidance('Qual o prazo?', tasks, tasks[0], 'crm'), /Hoje às 15h/);
assert.match(getGoGuidance('Quem é o responsável?', tasks, tasks[0], 'crm'), /não informa o responsável/);
assert.match(getGoGuidance('Você lê Syonet?', tasks, tasks[0], 'crm'), /Ainda não tenho integração/);
assert.match(getGoGuidance('O que faço agora?', [], undefined, 'pricing'), /Não há pendências identificadas/);

console.log('GO copiloto read-only: 7 cenários aprovados');
