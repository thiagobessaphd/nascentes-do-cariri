/**
 * Nascentes do Cariri — Utilitário de Simulação de DOM para Testes Unitários
 * Fornece implementação determinística, leve e segura de elementos DOM
 * em ambiente Node.js sem necessidade de dependências pesadas externas.
 */

export class MockDomElement {
  public readonly tagName: string;
  public className: string = '';
  public id: string = '';
  private _textContent: string = '';
  private readonly _attributes: Map<string, string> = new Map();
  public readonly children: MockDomElement[] = [];
  public parentNode: MockDomElement | null = null;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  public get textContent(): string {
    if (this.children.length > 0) {
      return this.children.map((child) => child.textContent).join('');
    }
    return this._textContent;
  }

  public set textContent(value: string) {
    this._textContent = String(value);
    this.children.length = 0;
  }

  public setAttribute(name: string, value: string): void {
    const strVal = String(value);
    this._attributes.set(name, strVal);
    if (name === 'id') {
      this.id = strVal;
    }
    if (name === 'class') {
      this.className = strVal;
    }
  }

  public getAttribute(name: string): string | null {
    if (name === 'id' && this.id) {
      return this.id;
    }
    if (name === 'class' && this.className) {
      return this.className;
    }
    return this._attributes.get(name) ?? null;
  }

  public hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  public removeAttribute(name: string): void {
    this._attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.className = '';
  }

  public appendChild<T extends MockDomElement>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  public matches(selector: string): boolean {
    const trimmed = selector.trim();

    // Seletor de classe composta (.foo.bar) ou simples (.foo)
    if (trimmed.startsWith('.')) {
      const classes = trimmed.slice(1).split('.').filter(Boolean);
      const elementClasses = this.className.split(/\s+/).filter(Boolean);
      return classes.every((cls) => elementClasses.includes(cls));
    }

    // Seletor de ID (#meu-id)
    if (trimmed.startsWith('#')) {
      return this.id === trimmed.slice(1);
    }

    // Seletor de atributo ([role="tooltip"] ou [aria-labelledby="..."])
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1);
      const equalIndex = inner.indexOf('=');
      if (equalIndex === -1) {
        return this.hasAttribute(inner.trim());
      }
      const attrName = inner.slice(0, equalIndex).trim();
      const rawVal = inner.slice(equalIndex + 1).trim();
      const attrValue = rawVal.replace(/^["']|["']$/g, '');
      return this.getAttribute(attrName) === attrValue;
    }

    // Seletor de TagName (h3, dl, dt, dd, article, etc.)
    return this.tagName.toLowerCase() === trimmed.toLowerCase();
  }

  public querySelector<T = MockDomElement>(selector: string): T | null {
    for (const child of this.children) {
      if (child.matches(selector)) {
        return child as unknown as T;
      }
      const matchInSubtree = child.querySelector<T>(selector);
      if (matchInSubtree) {
        return matchInSubtree;
      }
    }
    return null;
  }

  public querySelectorAll<T = MockDomElement>(selector: string): T[] {
    const results: T[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) {
        results.push(child as unknown as T);
      }
      results.push(...child.querySelectorAll<T>(selector));
    }
    return results;
  }
}

export interface MockDocument {
  createElement: (tagName: string) => MockDomElement;
}

let originalDocument: unknown = undefined;

/**
 * Instala um ambiente DOM simulado leve no globalThis do Node.js.
 */
export function installMockDom(): void {
  originalDocument = globalThis.document;

  const mockDoc: MockDocument = {
    createElement: (tagName: string) => new MockDomElement(tagName),
  };

  // @ts-expect-error Mock parcial controlado para execução de testes em Node
  globalThis.document = mockDoc;
}

/**
 * Restaura o valor original do document no globalThis.
 */
export function restoreMockDom(): void {
  // @ts-expect-error Restauração controlada do estado global
  globalThis.document = originalDocument;
}
