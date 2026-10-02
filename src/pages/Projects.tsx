import { useEffect, useId, useState } from "react";
import type { ProjectSummary } from "../../shared/api";
import { api, ApiError } from "../api/client";
import { engine } from "../engine/client";
import { Link, navigate } from "../router";
import { AppNav } from "../components/Chrome";
import { LoadingNetwork } from "../components/canvas/LoadingNetwork";
import { pad, STEPS } from "../steps";
import { Menu, MenuItem } from "../ui/Menu";
import { FlagNote, Modal } from "../ui/primitives";

type Listing = { status: "loading" } | { status: "ready"; projects: ProjectSummary[] } | { status: "error"; message: string };

const when = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function started(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "3 minutes ago", "yesterday", or the date for anything older than a week. */
function updated(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return when.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return when.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return when.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The analysis history: every saved analysis, newest first. */
export function Projects() {
  const [listing, setListing] = useState<Listing>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const titleId = useId();

  // The engine starts loading here, so the first analysis opens ready to run.
  useEffect(() => engine.boot(), []);

  const load = () =>
    api<{ projects: ProjectSummary[] }>("GET", "/projects")
      .then(({ projects }) => setListing({ status: "ready", projects }))
      .catch((error: Error) => setListing({ status: "error", message: error.message }));

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setCreating(true);
    setProblem(null);
    try {
      const { project } = await api<{ project: ProjectSummary }>("POST", "/projects", {});
      navigate(`/projects/${project.id}`);
    } catch (error) {
      setProblem((error as Error).message);
      setCreating(false);
    }
  };

  const act = async (work: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await work();
      await load();
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : "That did not work. Try again.");
    }
  };

  const projects = listing.status === "ready" ? listing.projects : [];
  // Numbered by age, like sources: the first analysis is 001 and keeps its number.
  const numberOf = new Map(
    [...projects].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((project, index) => [project.id, index + 1]),
  );

  return (
    <div className="pf-page">
      <AppNav />
      <main className="pf-page__main" aria-labelledby={titleId}>
        <header className="pf-page__head">
          <div>
            <p className="metadata pf-ink-secondary">Your analyses</p>
            <h1 className="pf-page__title" id={titleId}>
              History
            </h1>
          </div>
          {projects.length > 0 && (
            <button type="button" className="ml-btn ml-btn--primary" onClick={() => void create()} disabled={creating}>
              {creating ? "Creating…" : "New analysis"}
            </button>
          )}
        </header>
        <p className="body-lg pf-page__lead">
          Each analysis keeps its dataset, coding schema, settings, figures, results and interpretations, so you can
          reopen it where you left off.
        </p>
        {problem && <FlagNote>{problem}</FlagNote>}

        {listing.status === "loading" && <LoadingNetwork caption="Loading your analyses…" />}
        {listing.status === "error" && (
          <div className="ml-empty">
            <div className="ml-empty__eyebrow">The analyses did not load</div>
            <p className="ml-empty__body">{listing.message}</p>
            <button type="button" className="ml-btn ml-btn--secondary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {listing.status === "ready" && projects.length === 0 && (
          <div className="ml-empty">
            <div className="ml-empty__eyebrow">No analyses yet</div>
            <p className="ml-empty__body">
              Start one with your own coded CSV, or with one of the example datasets from the pyENA repository.
            </p>
            <button type="button" className="ml-btn ml-btn--primary" onClick={() => void create()} disabled={creating}>
              {creating ? "Creating…" : "New analysis"}
            </button>
          </div>
        )}

        {projects.length > 0 && (
          <ol className="pf-history">
            {projects.map((project) => (
              <li key={project.id} className="pf-history__row">
                <span className="metadata pf-ink-secondary pf-history__num">Analysis {String(numberOf.get(project.id) ?? 0).padStart(3, "0")}</span>
                <div className="pf-history__main">
                  <Link to={`/projects/${project.id}`} className="pf-history__title">
                    {project.name}
                  </Link>
                  <div className="ml-source__meta">
                    <span>{project.fileName ?? "No dataset yet"}</span>
                    {project.rowCount !== null && <span>{project.rowCount.toLocaleString("en-US")} rows</span>}
                    {project.codes > 0 && <span>{project.codes} codes</span>}
                    {project.groups[0] && project.groups[1] && (
                      <span>
                        {project.groups[0]} and {project.groups[1]}
                      </span>
                    )}
                    {project.codes > 0 && <span>{project.dimensions} dimensions</span>}
                    {project.hasSchema && <span>Coding schema</span>}
                  </div>
                  {project.status === "analysed" && (
                    <p className="small pf-history__finding">
                      {project.separates.length > 0
                        ? `Welch's t separates the groups on dimension ${project.separates.join(" and ")} (p < .05)`
                        : "Welch's t separates the groups on neither dimension"}
                      {project.conversations > 0 &&
                        ` / ${project.conversations} ${project.conversations === 1 ? "conversation" : "conversations"}`}
                      {project.interpretations > 0 &&
                        ` / ${project.interpretations} ${project.interpretations === 1 ? "interpretation" : "interpretations"}`}
                    </p>
                  )}
                </div>
                <span className="pf-history__state">
                  {project.status === "analysed" ? (
                    <span className="ml-tag ml-tag--brand">
                      <span className="ml-tag-dot" />
                      Analysed
                    </span>
                  ) : (
                    <span className="ml-tag">
                      Draft / {pad(project.step)} {STEPS[project.step - 1]?.name}
                    </span>
                  )}
                  <span className="small pf-note">
                    Started {started(project.createdAt)}, updated {updated(project.updatedAt)}
                  </span>
                </span>
                <Link to={`/projects/${project.id}`} className="ml-btn ml-btn--secondary pf-history__open">
                  Open
                </Link>
                <Menu label={`Actions for ${project.name}`} trigger={<span className="label">Actions</span>}>
                  {(close) => (
                    <>
                      <MenuItem
                        onSelect={() => {
                          close();
                          navigate(`/projects/${project.id}`);
                        }}
                      >
                        <span className="pf-menu__text">Open</span>
                      </MenuItem>
                      <MenuItem
                        onSelect={() => {
                          close();
                          setRenaming(project);
                        }}
                      >
                        <span className="pf-menu__text">Rename</span>
                      </MenuItem>
                      <MenuItem
                        onSelect={() => {
                          close();
                          void act(() => api("POST", `/projects/${project.id}/duplicate`, {}));
                        }}
                      >
                        <span className="pf-menu__text">Duplicate</span>
                      </MenuItem>
                      <MenuItem
                        tone="danger"
                        onSelect={() => {
                          close();
                          setDeleting(project);
                        }}
                      >
                        <span className="pf-menu__text">Delete</span>
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </li>
            ))}
          </ol>
        )}
      </main>

      {renaming && (
        <RenameDialog
          project={renaming}
          onClose={() => setRenaming(null)}
          onRename={(name) => {
            setRenaming(null);
            void act(() => api("PATCH", `/projects/${renaming.id}`, { name }));
          }}
        />
      )}
      {deleting && (
        <Modal
          title="Delete this analysis?"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setDeleting(null)}>
                Keep it
              </button>
              <button
                type="button"
                className="ml-btn ml-btn--primary"
                onClick={() => {
                  const target = deleting;
                  setDeleting(null);
                  void act(() => api("DELETE", `/projects/${target.id}`));
                }}
              >
                Delete {deleting.name}
              </button>
            </>
          }
        >
          {deleting.name} is removed from your account with its dataset, coding schema, settings, figures, results and
          interpretations. This cannot be undone. Download anything you need from its results first.
        </Modal>
      )}
    </div>
  );
}

function RenameDialog({
  project,
  onClose,
  onRename,
}: {
  project: ProjectSummary;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(project.name);
  const id = useId();
  const valid = name.trim().length > 0;
  return (
    <Modal
      title="Rename this analysis"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="ml-btn ml-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ml-btn ml-btn--primary" disabled={!valid} onClick={() => onRename(name.trim())}>
            Rename
          </button>
        </>
      }
    >
      <div className="ml-field">
        <label htmlFor={id}>Name</label>
        <input
          id={id}
          className="ml-input"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && valid && onRename(name.trim())}
        />
      </div>
    </Modal>
  );
}
