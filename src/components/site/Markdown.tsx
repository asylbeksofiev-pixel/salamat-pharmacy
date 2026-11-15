import ReactMarkdown from "react-markdown";

/** Renders staff-edited Markdown. Raw HTML is not allowed (react-markdown escapes it by default). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-salamat">
      <ReactMarkdown
        components={{
          a: ({ href, children: c }) => {
            const external = href && /^https?:\/\//.test(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {c}
              </a>
            );
          },
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
