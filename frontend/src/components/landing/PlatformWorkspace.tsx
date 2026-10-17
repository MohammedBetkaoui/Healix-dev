"use client";

import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderHeart,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";

import styles from "./landing.module.css";
import type { LandingContent } from "./types";

type WorkspaceContent = LandingContent["context"]["workspace"];
type WorkspaceView = "record" | "activity" | "documents";

const viewIcons = { record: FolderHeart, activity: CalendarDays, documents: FileText };
const historyIcons = [Stethoscope, FileCheck2, CalendarDays];

export function PlatformWorkspace({ content }: { content: WorkspaceContent }) {
  const [activeView, setActiveView] = useState<WorkspaceView>("record");
  const selectedView = content.views.find((view) => view.id === activeView) ?? content.views[0];
  const isActivity = activeView === "activity";
  const HeaderIcon = isActivity ? CalendarDays : UserRound;

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceNav}>
        <p className={styles.workspaceOverline}>{content.navigationLabel}</p>
        <div className={styles.workspaceChoices} role="group" aria-label={content.navigationLabel}>
          {content.views.map((view, index) => {
            const Icon = viewIcons[view.id];
            return (
              <button
                key={view.id}
                id={`platform-choice-${view.id}`}
                type="button"
                aria-pressed={activeView === view.id}
                aria-controls="platform-workspace-preview"
                onClick={() => setActiveView(view.id)}
                className={styles.workspaceChoice}
              >
                <span className={styles.workspaceChoiceNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.workspaceChoiceCopy}>
                  <strong><Icon aria-hidden="true" />{view.title}</strong>
                  <span>{view.description}</span>
                </span>
                <ArrowRight className={styles.workspaceChoiceArrow} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <p className={styles.workspacePrinciple}><span aria-hidden="true" />{content.principle}</p>
      </div>

      <div className={styles.workspaceStage}>
        <div className={styles.workspaceToolbar}>
          <span className={styles.workspaceBrand}>
            <strong>Healix<span>Dz</span></strong>
            <ChevronRight aria-hidden="true" />
            <span className={styles.workspacePath}>{selectedView.label}</span>
          </span>
          <span className={styles.workspaceDemo}>{content.previewLabel}</span>
        </div>
        <div
          id="platform-workspace-preview"
          role="region"
          aria-labelledby={`platform-choice-${activeView}`}
          aria-live="polite"
          aria-atomic="true"
          className={styles.workspacePreview}
        >
          <div className={styles.workspacePatient}>
            <span className={styles.workspaceAvatar}><HeaderIcon aria-hidden="true" /></span>
            <div>
              <p>{isActivity ? content.activityEyebrow : content.patientEyebrow}</p>
              <h3>{isActivity ? content.activityLabel : content.patientLabel}</h3>
              <span dir={isActivity ? undefined : "ltr"}>{isActivity ? content.activityMeta : "PT-0248"}</span>
            </div>
            {isActivity ? null : <span className={styles.workspacePatientStatus}><span aria-hidden="true" />{content.recordStatus}</span>}
          </div>

          <div key={activeView} className={styles.workspaceContent}>
            <div className={styles.workspaceViewHeading}>
              <h4>{selectedView.heading}</h4>
              <span>{selectedView.detail}</span>
            </div>

            {activeView === "record" ? (
              <div className={styles.recordView}>
                <ol className={styles.recordHistory}>
                  {content.history.map((entry, index) => {
                    const Icon = historyIcons[index];
                    return (
                      <li className={styles.recordHistoryEntry} key={entry.title}>
                        <span className={styles.recordHistoryIcon}><Icon aria-hidden="true" /></span>
                        <div><span>{entry.time}</span><strong>{entry.title}</strong><p>{entry.detail}</p></div>
                        {index === content.history.length - 1 ? <ArrowRight className={styles.recordHistoryCheck} aria-hidden="true" /> : <Check className={styles.recordHistoryCheck} aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ol>
                <aside className={styles.recordSummary} aria-label={content.summaryLabel}>
                  <ClipboardList aria-hidden="true" />
                  <h5>{content.summaryLabel}</h5>
                  <dl>{content.summary.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
                </aside>
              </div>
            ) : activeView === "activity" ? (
              <div className={styles.agendaView}>
                {content.appointments.map((item, index) => (
                  <div className={styles.agendaEntry} data-current={index === 0} key={item.time}>
                    <time dir="ltr">{item.time}</time>
                    <div><strong>{item.title}</strong><span>{item.patient}</span></div>
                    <span className={styles.agendaStatus}>{item.status}</span>
                  </div>
                ))}
                <p className={styles.workspaceContextNote}><FolderHeart aria-hidden="true" />{content.agendaNote}</p>
              </div>
            ) : (
              <div className={styles.documentsView}>
                {content.documents.map((item) => (
                  <div className={styles.documentEntry} key={item.title}>
                    <span className={styles.documentIcon}><FileText aria-hidden="true" /><small>PDF</small></span>
                    <div><strong>{item.title}</strong><span>{item.category} · {item.date}</span></div>
                    <span className={styles.documentStatus}><Check aria-hidden="true" />{item.status}</span>
                  </div>
                ))}
                <p className={styles.workspaceContextNote}><FolderHeart aria-hidden="true" />{content.documentsNote}</p>
              </div>
            )}
          </div>
        </div>
        <div className={styles.workspaceStatusbar}>
          <span><ShieldCheck aria-hidden="true" />{content.accessLabel}</span>
          <span>{content.continuityLabel}</span>
        </div>
      </div>
    </div>
  );
}
