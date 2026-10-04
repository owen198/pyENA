import { useEffect, useId, useState } from "react";
import type { ProjectSummary } from "../../../shared/api";
import { api } from "../../api/client";
import { REPOSITORY_SAMPLES } from "../../data/samples";
import { Link, navigate } from "../../router";
import { setHandoff } from "../../state/handoff";
import { useSession } from "../../state/session";
import { useArrival } from "../../ui/useArrival";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function findings(project: ProjectSummary): string {
  if (project.status !== "analysed") return "Not run yet";
  if (project.separates.length === 0) return "No dimension separates the groups";
  return `Groups separate on dimension ${project.separates.join(" and ")}`;
}

/**
 * Analyses stay: signed in, the researcher's own most recent ones; otherwise
 * the pyENA examples, each ready to open as a new analysis.
 */
export function HistoryDemo() {
  const status = useSession((state) => state.status);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (status !== "signedIn") return;
    api<{ projects: ProjectSummary[] }>("GET", "/projects")
      .then(({ projects: list }) => setProjects(list.slice(0, 4)))
      .catch(() => setProjects([]));
  }, [status]);

  const own = status === "signedIn" && projects !== null && projects.length > 0;
  const arrival = useArrival();

  return (
    <section className={`st-section st-arrive${arrival.state}`} id="history" aria-labelledby={titleId} ref={arrival.ref}>
      <div className="st-block">
        <p className="metadata pf-ink-secondary">History</p>
        <h2 className="st-h2" id={titleId}>
          Every analysis stays
        </h2>
        <p className="body-lg st-lead">
          Each analysis keeps its data, coding schema, settings, figures, results and interpretation. Come back to any of
          them, duplicate one to try other settings, or start again.
        </p>

        <ol className="pf-history st-history" style={{ ["--n" as string]: own ? projects!.length : REPOSITORY_SAMPLES.length }}>
          {own
            ? projects!.map((project, index) => (
                <li key={project.id} className="st-history__row" style={{ ["--i" as string]: index }}>
                  <div className="pf-history__main">
                    <Link to={`/projects/${project.id}`} className="pf-history__title">
                      {project.name}
                    </Link>
                    <div className="ml-source__meta">
                      <span>{date(project.updatedAt)}</span>
                      <span>{project.codes} codes</span>
                      <span>{findings(project)}</span>
                    </div>
                  </div>
                  <Link to={`/projects/${project.id}`} className="ml-btn ml-btn--secondary">
                    Open
                  </Link>
                </li>
              ))
            : REPOSITORY_SAMPLES.map((sample, index) => (
                <li key={sample.id} className="st-history__row" style={{ ["--i" as string]: index }}>
                  <div className="pf-history__main">
                    <span className="pf-history__title">{sample.name}</span>
                    <div className="ml-source__meta">
                      <span className="ml-tag">Example</span>
                      <span>{sample.facts}</span>
                      <span>{sample.description}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ml-btn ml-btn--secondary"
                    onClick={() => {
                      setHandoff({ name: sample.name, file: null, sampleId: sample.id });
                      navigate(status === "signedIn" ? "/start" : "/signup?next=/start");
                    }}
                  >
                    Open as an analysis
                  </button>
                </li>
              ))}
        </ol>
        <p className="small pf-note">
          {own ? (
            <Link to="/projects">See all your analyses</Link>
          ) : status === "signedIn" ? (
            "Your own analyses will be listed here once you start one."
          ) : (
            "These are the examples from the pyENA repository. Signed in, your own analyses are listed here."
          )}
        </p>
      </div>
    </section>
  );
}
