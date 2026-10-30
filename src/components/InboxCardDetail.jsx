import CardDetail from "./CardDetail";
import { cardChecklists, cardLabels, dayFromNow, makeChecklist, makeChecklistItem } from "../lib/board-utils";
import { normalizeRepeat } from "../lib/repeat";

/** Reuse the card detail UI, with all edits aimed explicitly at Inbox. */
export default function InboxCardDetail({ card, root, labels, onUpdate, onFile, onClose, onAddLabel, onUpdateLabel, onDeleteLabel }) {
  const update = (fields) => onUpdate(card.id, fields);
  const lists = (updater) => update({ checklists: updater(cardChecklists(card)) });
  const items = (listId, updater) => lists((all) => all.map((list) => list.id === listId ? { ...list, items: updater(list.items) } : list));
  const checklistActions = {
    add: (_c, _i, title) => lists((all) => [...all, makeChecklist(title)]),
    rename: (_c, _i, id, title) => lists((all) => all.map((list) => list.id === id ? { ...list, title } : list)),
    remove: (_c, _i, id) => lists((all) => all.filter((list) => list.id !== id)),
    addItem: (_c, _i, id, text) => items(id, (all) => [...all, makeChecklistItem(text)]),
    toggleItem: (_c, _i, id, itemId) => items(id, (all) => all.map((item) => item.id === itemId ? { ...item, done: !item.done } : item)),
    updateItem: (_c, _i, id, itemId, text) => items(id, (all) => all.map((item) => item.id === itemId ? { ...item, text } : item)),
    removeItem: (_c, _i, id, itemId) => items(id, (all) => all.filter((item) => item.id !== itemId)),
  };

  return <CardDetail inbox card={card} root={root} path={[]} colId={null} labels={labels}
    onClose={onClose} onUpdate={(_colId, _id, fields) => update(fields)}
    onMove={(_colId, id, path, destColId) => onFile(id, path, destColId)}
    onToggleLabel={(_colId, _id, labelId) => {
      const selected = cardLabels(card);
      update({ labels: selected.includes(labelId) ? selected.filter((id) => id !== labelId) : [...selected, labelId] });
    }}
    onAddLabel={onAddLabel} onUpdateLabel={onUpdateLabel} onDeleteLabel={onDeleteLabel}
    onSetDue={(_colId, _id, dueAt) => update({ dueAt: dueAt || null })}
    onSetRepeat={(_colId, _id, value) => {
      const repeat = normalizeRepeat(value);
      update({ repeat, ...(repeat && !card.dueAt ? { dueAt: dayFromNow(0) } : {}) });
    }}
    checklistActions={checklistActions} />;
}
