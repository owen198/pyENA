import { useLayoutEffect, useRef, useState } from "react";
import type { ColumnProfile } from "../../data/parse";
import { meaningOf } from "../../data/schema";
import { useStore } from "../../state/store";
import { AnnotationMark } from "../../ui/marks";
import { Tip } from "../../ui/primitives";

const ROW_HEIGHT = 36;
const OVERSCAN = 12;

const TYPE_LABEL: Record<ColumnProfile["type"], string> = {
  binary: "Binary",
  numeric: "Numeric",
  categorical: "Categorical",
  text: "Text",
  empty: "Empty",
};

/** The parsed table: a real <table>, virtualized, row numbers pinned (plan §8.1). */
export function DataTable() {
  const source = useStore((state) => state.source);
  const model = useStore((state) => state.model);
  const schema = useStore((state) => state.schema);
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () => setView({ top: element.scrollTop, height: element.clientHeight });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  if (!source) return null;
  const { rows, columns, profiles } = source.table;
  const start = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN);

  const roles = (column: string) => {
    const tags: { label: string; brand: boolean }[] = [];
    if (model.codes.includes(column)) tags.push({ label: "Code", brand: true });
    if (model.units.includes(column)) tags.push({ label: "Unit", brand: false });
    if (model.conversation.includes(column)) tags.push({ label: "Conversation", brand: false });
    if (model.groupColumn === column) tags.push({ label: "Group", brand: false });
    return tags;
  };

  return (
    <div className="pf-table-wrap" ref={scroller} tabIndex={0} aria-label={`${source.fileName}, parsed rows`}>
      <table className="pf-table">
        <thead>
          <tr>
            <th scope="col" className="pf-rownum metadata">
              <span className="pf-visually-hidden">Row</span>
            </th>
            {profiles.map((profile) => (
              <th scope="col" key={profile.name}>
                <div className="pf-colhead">
                  <span className="pf-colhead__name label">
                    {profile.name}
                    {profile.missingCount > 0 && (
                      <Tip text={`${profile.missingCount.toLocaleString("en-US")} missing values`} align="start">
                        <span className="pf-missing" tabIndex={0} aria-label={`${profile.missingCount} missing values`}>
                          <AnnotationMark size={24} />
                        </span>
                      </Tip>
                    )}
                  </span>
                  <span className="metadata pf-colhead__meta">
                    {TYPE_LABEL[profile.type]} / {profile.uniqueCount.toLocaleString("en-US")} unique
                  </span>
                  {meaningOf(schema, profile.name) && (
                    <span className="small pf-colhead__meaning" title={meaningOf(schema, profile.name)!}>
                      {meaningOf(schema, profile.name)}
                    </span>
                  )}
                  <span className="pf-colhead__tags">
                    {roles(profile.name).map((tag) => (
                      <span key={tag.label} className={`ml-tag${tag.brand ? " ml-tag--brand" : ""}`}>
                        {tag.label}
                      </span>
                    ))}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {start > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: start * ROW_HEIGHT, padding: 0 }} colSpan={columns.length + 1} />
            </tr>
          )}
          {rows.slice(start, end).map((row, offset) => {
            const index = start + offset;
            return (
              <tr key={index} className={`pf-row-data${index % 2 === 1 ? " is-odd" : ""}`}>
                <th scope="row" className="pf-rownum metadata pf-num">
                  {index + 1}
                </th>
                {columns.map((column) => (
                  <td key={column} title={row[column].length > 40 ? row[column] : undefined}>
                    {row[column]}
                  </td>
                ))}
              </tr>
            );
          })}
          {end < rows.length && (
            <tr aria-hidden="true">
              <td style={{ height: (rows.length - end) * ROW_HEIGHT, padding: 0 }} colSpan={columns.length + 1} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
