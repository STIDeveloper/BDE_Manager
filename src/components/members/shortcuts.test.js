import { test } from 'node:test';
import assert from 'node:assert/strict';
import { undoShortcutAction, isTypingTarget } from './shortcuts.js';

test('Ctrl+Z annule, Ctrl+Maj+Z / Ctrl+Y rétablissent (casse ignorée)', () => {
  assert.equal(undoShortcutAction({ ctrlKey: true, key: 'z' }), 'undo');
  assert.equal(undoShortcutAction({ ctrlKey: true, key: 'Z' }), 'undo'); // Verr. Maj
  assert.equal(undoShortcutAction({ ctrlKey: true, shiftKey: true, key: 'Z' }), 'redo');
  assert.equal(undoShortcutAction({ metaKey: true, shiftKey: true, key: 'z' }), 'redo');
  assert.equal(undoShortcutAction({ ctrlKey: true, key: 'y' }), 'redo');
  assert.equal(undoShortcutAction({ ctrlKey: true, key: 'Y' }), 'redo');
});

test('sans Ctrl/Cmd ou avec Alt : aucun raccourci', () => {
  assert.equal(undoShortcutAction({ key: 'z' }), null);
  assert.equal(undoShortcutAction({ ctrlKey: true, altKey: true, key: 'z' }), null); // AltGr
  assert.equal(undoShortcutAction({ ctrlKey: true, key: 'a' }), null);
});

test('champs de saisie ignorés (input, textarea, select, contenteditable, modale)', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'BUTTON', closest: () => ({}) }), true);
  assert.equal(isTypingTarget({ tagName: 'BODY', closest: () => null }), false);
  assert.equal(isTypingTarget(null), false);
});
