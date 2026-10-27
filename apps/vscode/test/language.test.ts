import { parse } from '@forme/core';
import { describe, expect, it } from 'vitest';
import { colorsIn, definitionsOf, idAt, isThemeSource, outline, parseHex, referencesOf, toHex } from '../src/language.js';

const deck = `deck "Test"
theme "./theme.forme"

slide @a layout=content
  fill @title "Hallo"
  rect @box x=100 y=300 w=400 h=200 fill=#1E40AF
  row @r x=0 y=0 w=800 gap=20
    rect @in w=100 h=100 fill=#FFF

slide @b
  rect @box x=10 y=10 w=10 h=10
  align left @box
`;

describe('language features', () => {
  const doc = parse(deck);

  it('finds the id under the cursor', () => {
    const at = deck.indexOf('@box') + 2;
    expect(idAt(doc, at)).toEqual({ name: 'box', span: { start: at - 2, end: at + 2 } });
    expect(idAt(doc, deck.indexOf('rect'))).toBeNull();
  });

  it('resolves definitions per slide', () => {
    const inB = deck.lastIndexOf('@box');
    const defs = definitionsOf(doc, 'box', inB);
    expect(defs).toHaveLength(1);
    expect(deck.slice(0, defs[0]?.start).split('\n')).toHaveLength(11);
    expect(definitionsOf(doc, 'box')).toHaveLength(2);
    expect(definitionsOf(doc, 'b')).toHaveLength(1);
  });

  it('lists references', () => {
    expect(referencesOf(doc, 'box')).toHaveLength(3);
  });

  it('builds an outline of slides and objects', () => {
    const o = outline(doc);
    expect(o.map((s) => [s.name, s.kind])).toEqual([
      ['Test', 'deck'],
      ['@a', 'slide'],
      ['@b', 'slide'],
    ]);
    expect(o[1]?.detail).toBe('layout=content');
    expect(o[1]?.children.map((c) => c.name)).toEqual(['@box', '@r']);
    expect(o[1]?.children[1]?.children.map((c) => c.name)).toEqual(['@in']);
  });

  it('outlines a theme', () => {
    const theme = parse('theme "T"\ncolor primary #112233\nstyle h1 size=64\nlayout content\n  slot @title x=0 y=0\n');
    expect(outline(theme).map((s) => `${s.kind}:${s.name}`)).toEqual(['color:primary', 'style:h1', 'layout:content']);
    expect(outline(theme)[2]?.children.map((c) => c.name)).toEqual(['@title']);
  });

  it('finds colors and converts them', () => {
    const colors = colorsIn(doc);
    expect(colors.map((c) => deck.slice(c.span.start, c.span.end))).toEqual(['#1E40AF', '#FFF']);
    expect(parseHex('#FFF')).toEqual([1, 1, 1, 1]);
    expect(toHex(parseHex('#1E40AF80') as [number, number, number, number])).toBe('#1E40AF80');
    expect(toHex([1, 0, 0, 1])).toBe('#FF0000');
  });

  it('tells themes from decks', () => {
    expect(isThemeSource('// x\ntheme "T"\n')).toBe(true);
    expect(isThemeSource(deck)).toBe(false);
  });
});
