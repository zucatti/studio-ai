/**
 * Fountain Format Exporter
 * Exports script elements to Fountain format (.fountain)
 * Compatible with Final Draft, Highland, and other screenplay software
 */

import type { ScriptElement } from '@/types/script';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description?: string | null;
}

interface ExportOptions {
  title?: string;
  author?: string;
  credit?: string;
  source?: string;
  contact?: string;
  draftDate?: string;
  includeNotes?: boolean;
  language?: 'en' | 'fr';
}

/**
 * Export script elements to Fountain format
 */
export function exportToFountain(
  scenes: Scene[],
  elementsByScene: Record<string, ScriptElement[]>,
  options: ExportOptions = {}
): string {
  const lines: string[] = [];

  // Title page
  if (options.title) {
    lines.push(`Title: ${options.title}`);
  }
  if (options.credit) {
    lines.push(`Credit: ${options.credit}`);
  }
  if (options.author) {
    lines.push(`Author: ${options.author}`);
  }
  if (options.source) {
    lines.push(`Source: ${options.source}`);
  }
  if (options.draftDate) {
    lines.push(`Draft date: ${options.draftDate}`);
  }
  if (options.contact) {
    lines.push(`Contact: ${options.contact}`);
  }

  // Separate title page from content
  if (lines.length > 0) {
    lines.push('');
    lines.push('===');
    lines.push('');
  }

  // Export scenes
  for (const scene of scenes.sort((a, b) => a.scene_number - b.scene_number)) {
    // Scene heading
    const heading = `${scene.int_ext}. ${scene.location} - ${scene.time_of_day}`;
    lines.push(heading.toUpperCase());
    lines.push('');

    // Scene description (as action)
    if (scene.description) {
      lines.push(scene.description);
      lines.push('');
    }

    // Scene elements
    const elements = elementsByScene[scene.id] || [];
    for (const element of elements.sort((a, b) => a.sort_order - b.sort_order)) {
      switch (element.type) {
        case 'action':
          lines.push(element.content);
          lines.push('');
          break;

        case 'dialogue':
          // Character name in uppercase
          let characterLine = (element.character_name || 'UNKNOWN').toUpperCase();
          if (element.extension) {
            characterLine += ` (${element.extension})`;
          }
          lines.push(characterLine);

          // Parenthetical
          if (element.parenthetical) {
            lines.push(`(${element.parenthetical})`);
          }

          // Dialogue content
          lines.push(element.content);
          lines.push('');
          break;

        case 'transition':
          // Transitions are right-aligned, uppercase, end with TO:
          const transition = element.content.toUpperCase();
          lines.push(`> ${transition}`);
          lines.push('');
          break;

        case 'note':
          if (options.includeNotes !== false) {
            // Notes in Fountain format
            lines.push(`[[${element.content}]]`);
            lines.push('');
          }
          break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Export script elements to structured Markdown format
 */
export function exportToMarkdown(
  scenes: Scene[],
  elementsByScene: Record<string, ScriptElement[]>,
  options: ExportOptions = {}
): string {
  const lines: string[] = [];

  // Title
  if (options.title) {
    lines.push(`# ${options.title}`);
    lines.push('');
    if (options.author) {
      lines.push(`**Auteur:** ${options.author}`);
    }
    if (options.draftDate) {
      lines.push(`**Date:** ${options.draftDate}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Export scenes
  for (const scene of scenes.sort((a, b) => a.scene_number - b.scene_number)) {
    // Scene heading
    lines.push(`## SCENE ${scene.scene_number}`);
    lines.push(`**${scene.int_ext}. ${scene.location} - ${scene.time_of_day}**`);
    lines.push('');

    // Scene description
    if (scene.description) {
      lines.push(`> ${scene.description}`);
      lines.push('');
    }

    // Scene elements
    const elements = elementsByScene[scene.id] || [];
    for (const element of elements.sort((a, b) => a.sort_order - b.sort_order)) {
      switch (element.type) {
        case 'action':
          lines.push(`*${element.content}*`);
          lines.push('');
          break;

        case 'dialogue':
          let characterHeader = `**${(element.character_name || 'UNKNOWN').toUpperCase()}**`;
          if (element.extension) {
            characterHeader += ` *(${element.extension})*`;
          }
          lines.push(characterHeader);
          if (element.parenthetical) {
            lines.push(`*(${element.parenthetical})*`);
          }
          lines.push(element.content);
          lines.push('');
          break;

        case 'transition':
          lines.push(`---`);
          lines.push(`*${element.content.toUpperCase()}*`);
          lines.push('');
          break;

        case 'note':
          if (options.includeNotes !== false) {
            lines.push(`> **Note:** ${element.content}`);
            lines.push('');
          }
          break;
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a filename for the export
 */
export function generateFilename(title: string, format: 'fountain' | 'md'): string {
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const date = new Date().toISOString().split('T')[0];
  return `${sanitized || 'script'}_${date}.${format}`;
}

/**
 * Download file in the browser
 */
export function downloadScript(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
