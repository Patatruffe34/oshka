import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

const plugins = [remarkGfm, remarkBreaks];
const components: Components = {
  p: ({ children }) => <p className="md-p">{children}</p>,
  code: ({ children, className = "" }) => <code className={`md-code ${className}`.trim()}>{children}</code>,
  a: ({ href, children }) => href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">{children}</a>
  ) : <span>{children}</span>,
};

// Allow the app's Obsidian source links while keeping the default URL checks
// for every other protocol and for images. Raw HTML is never executed.
const transformUrl: UrlTransform = (url, key) => {
  if (key === "href" && /^obsidian:\/\//i.test(url)) return url;
  return defaultUrlTransform(url);
};

export default function Markdown({ text, className = "" }: { text?: string | number | null; className?: string }) {
  if (!text) return null;
  return (
    <div className={`md ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={plugins} components={components} urlTransform={transformUrl}>
        {String(text)}
      </ReactMarkdown>
    </div>
  );
}
