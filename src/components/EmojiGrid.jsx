import { POPULAR_EMOJIS } from "../lib/emojis";

/** The emoji shortlist as a grid; the empty entry clears the current pick. */
export default function EmojiGrid({ current, onPick }) {
  return (
    <div className="emoji-picker">
      {POPULAR_EMOJIS.map((emoji) => (
        <button
          key={emoji || "none"}
          className={`emoji-option ${emoji === current ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onPick(emoji);
          }}
        >
          {emoji || "✕"}
        </button>
      ))}
    </div>
  );
}
