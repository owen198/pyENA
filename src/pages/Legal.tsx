// The Privacy Policy and the Terms of Service. Each says only what this
// platform actually does (server/, src/state/); where a fact belongs to the
// team, such as a contact address, it reads "to be added" until
// src/content/site.ts supplies it, never an invented one.

import type { ReactNode } from "react";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "../content/site";
import { Link } from "../router";
import { pad } from "../steps";
import { SitePage } from "./Site";

function Contact() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <span className="pf-note">the team's address, to be added</span>
  );
}

/** Numbered sections, as the research vocabulary numbers its objects. */
function Sections({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <>
      <p className="metadata pf-ink-secondary st-legal__date">Last updated {LEGAL_UPDATED}</p>
      <ol className="st-legal">
        {items.map((item, index) => (
          <li key={item.title} className="st-legal__item">
            <span className="metadata pf-ink-secondary">Section {pad(index + 1)}</span>
            <h2 className="st-h3">{item.title}</h2>
            <div className="st-legal__body">{item.body}</div>
          </li>
        ))}
      </ol>
      <p className="small pf-note st-legal__draft">
        Written in plain language for the IdeaLens demonstration. It will be reviewed before IdeaLens opens more widely,
        and any change will show a new date above.
      </p>
    </>
  );
}

export function PrivacyPage() {
  return (
    <SitePage
      eyebrow="Privacy Policy"
      title="Privacy Policy"
      lead="What IdeaLens keeps about you and your research, where it goes, and how to remove it."
    >
      <Sections
        items={[
          {
            title: "Your account",
            body: (
              <>
                <p className="body">
                  An account is a username and a password. The password is kept only as a scrypt hash, never as you typed
                  it. Signing in sets one cookie, readable only by the server, that keeps you signed in for up to 14 days
                  unless the server is set otherwise; the server keeps only a SHA-256 hash of it.
                </p>
                <p className="body">Your choice of light or dark theme is kept with the account, so it follows you.</p>
              </>
            ),
          },
          {
            title: "Your research",
            body: (
              <>
                <p className="body">
                  The analysis runs in your browser. To keep an analysis, IdeaLens saves it in your account on the server:
                  the dataset you added, the coding schema, the settings, the results, the figures and the
                  interpretations. Only your account can open them.
                </p>
                <p className="body">
                  Files you choose on the landing page stay in your browser until your analysis exists; they are not sent
                  anywhere before then. Deleting an analysis from your History deletes it from the server.
                </p>
              </>
            ),
          },
          {
            title: "The waitlist and product news",
            body: (
              <p className="body">
                If you join the waitlist or agree to product news, IdeaLens keeps your email address, the exact words you
                agreed to and when. Nothing else, and no email is sent from the platform itself: the team writes to the
                list. Leave the waitlist from the page where you joined, or withdraw product news in Settings, and the
                address is marked withdrawn and not written to again.
              </p>
            ),
          },
          {
            title: "Written with AI",
            body: (
              <p className="body">
                Where the server offers an AI reading (Anthropic's Claude, or OpenAI where the server is set up with it
                instead) and you ask for one, IdeaLens sends that provider's API the analysis summary, your coding schema
                and a few short lines from your data that carry the codes being discussed. It never sends the dataset. The built-in interpretation sends nothing anywhere.
              </p>
            ),
          },
          {
            title: "What your browser loads from elsewhere",
            body: (
              <p className="body">
                The analysis engine (Python, through Pyodide) and the 3D networks' drawing library are downloaded by your
                browser from the jsdelivr content network, which sees your IP address as any website does. IdeaLens uses
                no advertising or analytics trackers.
              </p>
            ),
          },
          {
            title: "Kept in your browser",
            body: (
              <p className="body">
                Your browser remembers a few conveniences on this device: your theme, each dataset's settings while you
                work, whether you have seen the introduction to the platform, and whether you were already asked about
                product news in this visit. Clearing your browser's site data removes them.
              </p>
            ),
          },
          {
            title: "Questions and removal",
            body: (
              <p className="body">
                To have your account and everything in it removed, or to ask what is kept about you, write to{" "}
                <Contact />. See also the <Link to="/terms">Terms of Service</Link>.
              </p>
            ),
          },
        ]}
      />
    </SitePage>
  );
}

export function TermsPage() {
  return (
    <SitePage
      eyebrow="Terms of Service"
      title="Terms of Service"
      lead="The terms for using IdeaLens while it is a demonstration, in plain language."
    >
      <Sections
        items={[
          {
            title: "A demonstration",
            body: (
              <p className="body">
                IdeaLens is a demonstration and is still being built. Features can change or be withdrawn, and the
                service can be unavailable. Joining the waitlist does not guarantee access by any date.
              </p>
            ),
          },
          {
            title: "Your research stays yours",
            body: (
              <p className="body">
                You keep every right to the data, coding schemas and writing you bring. You allow IdeaLens only what it
                needs to store your analyses and show them back to you.
              </p>
            ),
          },
          {
            title: "Data you may bring",
            body: (
              <p className="body">
                Bring only data you are allowed to analyse and store this way, under your study's ethics approval and the
                consent of the people in it. Remove names and other identifying details first wherever you can.
              </p>
            ),
          },
          {
            title: "Results and interpretations",
            body: (
              <p className="body">
                The numbers and figures come from the pyENA library, run unchanged. Interpretations, built in or written
                with AI, are aids to your reading, not findings in themselves: check them against the results before
                you rely on or publish them. IdeaLens is offered as it is, without any warranty that it is free of errors.
              </p>
            ),
          },
          {
            title: "Your account",
            body: (
              <p className="body">
                Keep your password to yourself. Do not try to reach another person's analyses, disrupt or overload the
                service, or use it for anything unlawful. An account used that way can be closed.
              </p>
            ),
          },
          {
            title: "The software",
            body: (
              <p className="body">
                IdeaLens and the pyENA library it runs are free software under the GNU General Public License, version 3.
              </p>
            ),
          },
          {
            title: "Changes and questions",
            body: (
              <p className="body">
                These terms can change as IdeaLens does; the date above says when they last did. Questions go to{" "}
                <Contact />. How your information is handled is in the <Link to="/privacy">Privacy Policy</Link>.
              </p>
            ),
          },
        ]}
      />
    </SitePage>
  );
}
