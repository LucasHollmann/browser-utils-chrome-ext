import { describe, expect, it } from 'vitest';
import { stripPrefixes } from './title-prefix';

describe('stripPrefixes', () => {
  it('remove o prefixo uma vez', () => {
    expect(stripPrefixes('🔁 Página', ['🔁 '])).toBe('Página');
  });

  it('remove repetições acidentais', () => {
    expect(stripPrefixes('🔁 🔁 🔁 Página', ['🔁 '])).toBe('Página');
  });

  it('remove também o prefixo antigo após troca de configuração', () => {
    expect(stripPrefixes('[dup] 🔁 Página', ['🔁 ', '[dup] '])).toBe('Página');
  });

  it('não mexe em título sem prefixo', () => {
    expect(stripPrefixes('Página', ['🔁 '])).toBe('Página');
  });

  it('só remove do início', () => {
    expect(stripPrefixes('Página 🔁 ', ['🔁 '])).toBe('Página 🔁 ');
  });

  it('ignora prefixos vazios sem travar', () => {
    expect(stripPrefixes('Página', ['', '🔁 '])).toBe('Página');
  });
});
