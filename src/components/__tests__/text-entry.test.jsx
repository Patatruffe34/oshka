// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { useMobileKeyboard } from "../../hooks/useMobileKeyboard";
import AddCard from "../AddCard";
import PlannerAdd from "../PlannerAdd";
import Checklist from "../Checklist";
import CardDetail from "../CardDetail";
import AddColumn from "../AddColumn";
import LabelPicker from "../LabelPicker";
import SearchPanel from "../SearchPanel";

let root;
let host;
let mobile;
function KeyboardPolicy({ children }) { useMobileKeyboard(); return children; }
const click = async (element) => act(() => element.click());
const type = async (element, value) => act(() => {
  const proto = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
});
const key = async (element, name, options = {}) => act(() =>
  element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, ...options }))
);
async function render(children, { policy = false } = {}) {
  await act(() => root.render(<I18nProvider>{policy ? <KeyboardPolicy>{children}</KeyboardPolicy> : children}</I18nProvider>));
}

beforeEach(() => {
  mobile = true;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("inceptio_lang", "en");
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({
    matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe.each(["board", "plan"])("%s card entry", (kind) => {
  async function mount(onAdd) {
    await render(kind === "board" ? <AddCard onAdd={onAdd} /> :
      <PlannerAdd root={{ columns: [{ id: "col", title: "Tasks", cards: [] }] }} onAdd={onAdd} />);
    await click(host.querySelector(kind === "board" ? ".add-card-btn" : ".planner-add-btn"));
    return host.querySelector("input");
  }

  it("ends mobile input after Enter, creating exactly one card", async () => {
    const onAdd = vi.fn();
    const input = await mount(onAdd);
    await type(input, "One task");
    await key(input, "Enter");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toBe("One task");
    expect(host.querySelector("input")).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it("ends mobile input after tapping Add", async () => {
    const onAdd = vi.fn();
    const input = await mount(onAdd);
    await type(input, "One task");
    await click(host.querySelector(".btn-primary"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(host.querySelector("input")).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it("keeps desktop batch entry focused", async () => {
    mobile = false;
    const onAdd = vi.fn();
    const input = await mount(onAdd);
    await type(input, "First task");
    await key(input, "Enter");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("does not submit while the keyboard is composing text", async () => {
    const onAdd = vi.fn();
    const input = await mount(onAdd);
    await type(input, "Composition");
    await key(input, "Enter", { isComposing: true });
    expect(onAdd).not.toHaveBeenCalled();
    expect(host.querySelector("input")).toBe(input);
  });

  it("cancels without adding a card", async () => {
    const onAdd = vi.fn();
    const input = await mount(onAdd);
    await type(input, "Draft");
    await click(host.querySelector(".btn-ghost"));
    expect(onAdd).not.toHaveBeenCalled();
    expect(host.querySelector("input")).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });
});

describe("mobile keyboard policy", () => {
  it("dismisses outside an unfinished draft without losing or submitting it", async () => {
    const onAdd = vi.fn();
    const outside = vi.fn();
    await render(<><AddCard onAdd={onAdd} /><button className="outside" onClick={outside}>Outside</button></>, { policy: true });
    await click(host.querySelector(".add-card-btn"));
    const input = host.querySelector("input");
    await type(input, "Unfinished draft");
    await click(host.querySelector(".outside"));
    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("Unfinished draft");
    expect(host.contains(input)).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it("does not blur a desktop editor when tapping plain content", async () => {
    mobile = false;
    await render(<><input /><span>Content</span></>, { policy: true });
    const input = host.querySelector("input");
    input.focus();
    await click(host.querySelector("span"));
    expect(document.activeElement).toBe(input);
  });
  it("dismisses on an outside action while still delivering the action", async () => {
    const action = vi.fn();
    await render(<><input /><button onClick={action}>Action</button></>, { policy: true });
    const input = host.querySelector("input");
    input.focus();
    await click(host.querySelector("button"));
    expect(document.activeElement).not.toBe(input);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss a tap within the text editor", async () => {
    await render(<textarea />, { policy: true });
    const input = host.querySelector("textarea");
    input.focus();
    await click(input);
    expect(document.activeElement).toBe(input);
  });

  it("dismisses on browser back/forward navigation", async () => {
    await render(<input />, { policy: true });
    const input = host.querySelector("input");
    input.focus();
    await act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(document.activeElement).not.toBe(input);
  });
});

describe("checklist entry", () => {
  const list = { id: "list", title: "Tasks", items: [{ id: "i", text: "Read", done: false }] };
  it("does not save an item draft on Escape or close the parent", async () => {
    const onUpdateItem = vi.fn();
    const parentKey = vi.fn();
    await render(<div onKeyDown={parentKey}><Checklist list={list} onUpdateItem={onUpdateItem} /></div>);
    await click(host.querySelector(".checklist-item-text"));
    const input = host.querySelector(".checklist-item-input");
    await type(input, "Cancelled");
    await key(input, "Escape");
    expect(onUpdateItem).not.toHaveBeenCalled();
    expect(parentKey).not.toHaveBeenCalled();
    expect(host.querySelector(".checklist-item-text").textContent).toBe("Read");
    expect(document.activeElement).not.toBe(input);
  });
  it("finishes mobile item creation", async () => {
    const onAddItem = vi.fn();
    await render(<Checklist list={list} onAddItem={onAddItem} />);
    await click(host.querySelector(".checklist-add-btn"));
    const input = host.querySelector(".checklist-add-form input");
    await type(input, "Write");
    await key(input, "Enter");
    expect(onAddItem).toHaveBeenCalledExactlyOnceWith("Write");
    expect(host.querySelector(".checklist-add-form")).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it("commits an item once on Enter, without bubbling to the parent", async () => {
    const onUpdateItem = vi.fn();
    const parentKey = vi.fn();
    await render(<div onKeyDown={parentKey}><Checklist list={list} onUpdateItem={onUpdateItem} /></div>);
    await click(host.querySelector(".checklist-item-text"));
    const input = host.querySelector(".checklist-item-input");
    await type(input, "Read again");
    await key(input, "Enter");
    expect(onUpdateItem).toHaveBeenCalledExactlyOnceWith("i", "Read again");
    expect(parentKey).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
  });
});

describe.each([true, false])("returning from the destination picker (mobile=%s)", (phone) => {
  it("preserves the title and resumes text focus only on desktop", async () => {
    mobile = phone;
    await render(<PlannerAdd root={{ columns: [{ id: "col", title: "Tasks", cards: [] }] }} onAdd={vi.fn()} />);
    await click(host.querySelector(".planner-add-btn"));
    const input = host.querySelector(".add-card-input");
    await type(input, "Keep my title");
    await click(host.querySelector(".planner-add-where"));
    expect(document.activeElement).not.toBe(input);
    const column = document.querySelector(".move-col-btn");
    await click(column);
    expect(input.value).toBe("Keep my title");
    expect(document.querySelector(".move-dialog")).toBeNull();
    if (phone) expect(document.activeElement).not.toBe(input);
    else expect(document.activeElement).toBe(input);
  });
});

describe('editing details', () => {
  async function mount() {
    const card = { id: 'card', title: 'Example', description: 'Original', board: { columns: [] } };
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    const add = vi.fn();
    await render(<CardDetail card={card} colId="col" root={{ columns: [{ id: 'col', title: 'Tasks', cards: [card] }] }} path={[]} labels={[]} onUpdate={onUpdate} onClose={onClose} checklistActions={{ add }} />);
    return { onUpdate, onClose, add };
  }

  it('saves a title once on Enter and leaves text focus', async () => {
    const { onUpdate } = await mount();
    const input = host.querySelector('.modal-title-input');
    input.focus();
    await type(input, 'Renamed');
    await key(input, 'Enter');
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('col', 'card', { title: 'Renamed' });
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps multiline Enter and dismisses only after saving', async () => {
    const { onUpdate } = await mount();
    await click(host.querySelector('.modal-desc-display'));
    const input = host.querySelector('.modal-desc-edit textarea');
    await type(input, 'Line one\nLine two');
    await key(input, 'Enter');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    await click(host.querySelector('.modal-desc-actions .btn-primary'));
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('col', 'card', { description: 'Line one\nLine two' });
    expect(document.activeElement).not.toBe(input);
    expect(host.querySelector('.modal-desc-edit')).toBeNull();
  });

  it('cancels a description without closing the card or saving the draft', async () => {
    const { onUpdate, onClose } = await mount();
    await click(host.querySelector('.modal-desc-display'));
    const input = host.querySelector('.modal-desc-edit textarea');
    await type(input, 'Draft');
    await key(input, 'Escape');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector('.modal-desc-display').textContent).toBe('Original');
    expect(document.activeElement).not.toBe(input);
  });

  it('ends comment input on mobile after publishing, preserving line breaks', async () => {
    const { onUpdate } = await mount();
    const input = host.querySelector('.comment-input');
    input.focus();
    await type(input, 'First line\nSecond line');
    await key(input, 'Enter');
    expect(onUpdate).not.toHaveBeenCalled();
    await click(host.querySelector('.comment-form button'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][2].comments[0].text).toBe('First line\nSecond line');
    expect(input.value).toBe('');
    expect(document.activeElement).not.toBe(input);
  });

  it('cancels checklist creation without closing the card', async () => {
    const { add, onClose } = await mount();
    await click(host.querySelector('.checklist-add-btn'));
    const input = host.querySelector('.checklist-add-form input');
    await type(input, 'Draft');
    await key(input, 'Escape');
    expect(add).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
  });
});

describe('other single-line forms', () => {
  it('finishes adding a column without retaining text focus', async () => {
    const onAdd = vi.fn();
    await render(<AddColumn onAdd={onAdd} />);
    await click(host.querySelector('.add-col-btn'));
    const input = host.querySelector('input');
    await type(input, 'Next');
    await key(input, 'Enter');
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('Next');
    expect(document.activeElement).not.toBe(input);
  });

  it('saves a label once and cancels a later rename without saving', async () => {
    const onUpdate = vi.fn();
    await render(<LabelPicker labels={[{ id: 'label', name: 'Original' }]} selected={[]} onUpdate={onUpdate} />);
    await click(host.querySelector('button[title="Rename"]'));
    const input = host.querySelector('.label-name-input');
    await type(input, 'Renamed');
    await key(input, 'Enter');
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('label', { name: 'Renamed' });
    expect(document.activeElement).not.toBe(input);
    await click(host.querySelector('button[title="Rename"]'));
    const draft = host.querySelector('.label-name-input');
    await type(draft, 'Cancelled');
    await key(draft, 'Escape');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(draft);
  });
});

describe('search', () => {
  async function mount() {
    const onGo = vi.fn();
    await render(<SearchPanel root={{ columns: [{ id: 'col', title: 'Tasks', cards: [{ id: 'card', title: 'Find me', board: { columns: [] } }] }] }} labels={[]} onGo={onGo} onClose={vi.fn()} />);
    const input = host.querySelector('.search-input');
    await type(input, 'Find');
    return { input, onGo };
  }

  it('shows results and dismisses mobile input when Search is pressed', async () => {
    const { input, onGo } = await mount();
    await key(input, 'Enter');
    expect(onGo).not.toHaveBeenCalled();
    expect(host.querySelector('.search-result')).not.toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps desktop Enter opening the selected result', async () => {
    mobile = false;
    const { input, onGo } = await mount();
    await key(input, 'Enter');
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});
