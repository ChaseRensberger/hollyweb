import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  TrophyIcon,
  CheckIcon,
  ShareNetworkIcon,
  FloppyDiskIcon,
  ArrowsClockwiseIcon,
  TreeStructureIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { Button } from "@hollyweb/core/components/core/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@hollyweb/core/components/core/dialog";
import { cn } from "@hollyweb/core/lib/utils";
import { z } from "zod";
import { api, ApiError, meOptions, sharedOptions, runOptions, loginURL, type Run } from "../api";
import { EntrantArt, ErrorNotice, Loading, PageHeading, SignInPrompt } from "../components";
import {
  tournament,
  chooseWinner,
  validPicks,
  entrantSchema,
  type Picks,
} from "../../shared/bracket";

const localRun = z.object({
  id: z.uuid(),
  version: z.object({
    id: z.uuid(),
    bracketID: z.uuid(),
    number: z.number(),
    title: z.string(),
    description: z.string(),
    entrants: z.array(entrantSchema).min(8).max(64),
    createdAt: z.number(),
  }),
  picks: z.record(z.string(), z.string()),
});
type LocalRun = z.infer<typeof localRun>;
function loadLocal(key: string): LocalRun | null {
  try {
    const parsed = localRun.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
    return parsed.success && validPicks(parsed.data.version.entrants, parsed.data.picks)
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export function SharedBracket() {
  const { shareID } = useParams({ from: "/b/$shareID" });
  const query = useQuery(sharedOptions(shareID));
  const [copied, setCopied] = useState(false);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  const { version } = query.data;
  return (
    <>
      <PageHeading eyebrow={`${version.entrants.length} entrants`} title={version.title}>
        <Button
          variant="outline"
          onClick={() =>
            void navigator.clipboard
              .writeText(location.href)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          <ShareNetworkIcon />
          {copied ? "Copied" : "Copy link"}
        </Button>
      </PageHeading>
      <div className="shared-intro">
        {version.description && <p>{version.description}</p>}
        <Button
          nativeButton={false}
          size="lg"
          render={<Link to="/play/$shareID" params={{ shareID }} />}
        >
          Start bracket <ArrowRightIcon />
        </Button>
        <span className="text-xs text-muted-foreground">No sign-in required.</span>
      </div>
      <div className="mb-5 mt-12 flex items-center justify-between">
        <p className="holly-section-label">Entrants</p>
        <span className="text-xs text-muted-foreground">Seed order · Version {version.number}</span>
      </div>
      <div className="contender-grid">
        {version.entrants.map((entry, index) => (
          <div key={entry.id} className="contender-preview">
            <EntrantArt entry={entry} />
            <div>
              <span className="seed-number">{String(index + 1).padStart(2, "0")}</span>
              <h2>{entry.name}</h2>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function GuestPlay() {
  const { shareID } = useParams({ from: "/play/$shareID" });
  const query = useQuery(sharedOptions(shareID));
  const key = `hollyweb-run:${shareID}`;
  const [local] = useState(() => loadLocal(key));
  const [runID] = useState(() => crypto.randomUUID());
  if (query.isPending && !local) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  const initial =
    local ?? (query.data ? { id: runID, version: query.data.version, picks: {} } : null);
  if (!initial) return <Loading />;
  return <PlaySession key={initial.id} initial={initial} storageKey={key} />;
}

export function SavedPlay() {
  const { id } = useParams({ from: "/run/$id" });
  const me = useQuery(meOptions);
  const query = useQuery({ ...runOptions(id), enabled: Boolean(me.data?.user) });
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorNotice error={me.error} />;
  if (!me.data?.user) return <SignInPrompt />;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  return (
    <PlaySession
      key={`${id}:${query.data.run.revision}`}
      initial={{ id, version: query.data.version, picks: query.data.run.picks }}
      savedRun={query.data.run}
    />
  );
}

function PlaySession({
  initial: provided,
  storageKey,
  savedRun,
}: {
  initial: LocalRun;
  storageKey?: string;
  savedRun?: Run;
}) {
  const [initial] = useState(provided);
  const me = useQuery(meOptions);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [picks, setPicks] = useState<Picks>(initial.picks);
  const [revision, setRevision] = useState(savedRun?.revision ?? 0);
  const [view, setView] = useState<"cards" | "tree">("cards");
  const [review, setReview] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [localError, setLocalError] = useState<Error | null>(null);
  const tree = tournament(initial.version.entrants, picks);
  const match = tree.matches.find((item) => item.id === review) ?? tree.next;
  const save = useMutation({
    mutationFn: (next: Picks) =>
      savedRun
        ? api<Run>(`/api/runs/${initial.id}`, {
            method: "PUT",
            body: JSON.stringify({ picks: next, revision }),
          })
        : api<Run>("/api/runs", {
            method: "POST",
            body: JSON.stringify({ id: initial.id, versionID: initial.version.id, picks: next }),
          }),
    onSuccess: async (run) => {
      setRevision(run.revision);
      void cache.invalidateQueries({ queryKey: ["dashboard"] });
      if (!savedRun) {
        if (storageKey) localStorage.removeItem(storageKey);
        await navigate({ to: "/run/$id", params: { id: run.id } });
      }
    },
  });
  function change(next: Picks) {
    setPicks(next);
    setReview(null);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...initial, picks: next }));
        setLocalError(null);
      } catch {
        setLocalError(
          new Error(
            "Browser storage is full or unavailable. Keep this tab open and sign in to save your picks.",
          ),
        );
      }
    }
    if (savedRun) save.mutate(next);
  }
  function pick(id: string) {
    if (!match || save.isPending) return;
    change(chooseWinner(initial.version.entrants, picks, match.id, id));
  }
  const title = tree.winner && !review ? "Complete" : review ? "Change pick" : "Pick a winner";
  return (
    <>
      <PageHeading
        eyebrow={`${initial.version.title} / Version ${initial.version.number}`}
        title={title}
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView(view === "cards" ? "tree" : "cards")}
          >
            {view === "cards" ? (
              <>
                <TreeStructureIcon /> Bracket view
              </>
            ) : (
              <>
                <SquaresFourIcon /> Matchup view
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Start over"
            disabled={save.isPending}
            onClick={() => setResetOpen(true)}
          >
            <ArrowsClockwiseIcon />
          </Button>
        </div>
      </PageHeading>
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs text-muted-foreground">
          <span>
            {tree.completed} of {tree.total} matchups picked
          </span>
          <span>
            {savedRun
              ? save.isPending
                ? "Saving…"
                : save.error
                  ? "Not saved"
                  : "Saved to your account"
              : "Guest run · saved in this browser"}
          </span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-sm bg-muted"
          role="progressbar"
          aria-label="Bracket progress"
          aria-valuenow={tree.completed}
          aria-valuemin={0}
          aria-valuemax={tree.total}
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${(tree.completed / tree.total) * 100}%` }}
          />
        </div>
      </div>
      {save.error && (
        <ErrorNotice
          error={save.error}
          retryLabel={
            save.error instanceof ApiError && save.error.status === 409
              ? "Load latest picks"
              : "Try again"
          }
          retry={() => {
            if (save.error instanceof ApiError && save.error.status === 409)
              void cache.invalidateQueries({ queryKey: ["run", initial.id] });
            else save.mutate(picks);
          }}
        />
      )}
      {localError && <ErrorNotice error={localError} />}
      {view === "tree" ? (
        <div
          className="tournament-scroll"
          tabIndex={0}
          aria-label="Bracket overview, scroll horizontally to see all rounds"
        >
          <div className="tournament-tree">
            {tree.rounds.map((round, i) => (
              <section key={i} className="tree-round">
                <h2 className="holly-section-label">
                  {i === tree.rounds.length - 1
                    ? "Final"
                    : i === tree.rounds.length - 2
                      ? "Semifinals"
                      : `Round ${i + 1}`}
                </h2>
                <div>
                  {round.map((item) => (
                    <div className="tree-match" key={item.id}>
                      {[item.a, item.b].map((entry, j) => (
                        <button
                          key={j}
                          disabled={
                            !entry ||
                            item.status === "waiting" ||
                            item.status === "bye" ||
                            save.isPending
                          }
                          aria-label={
                            entry
                              ? `Pick ${entry.name} in round ${i + 1}, matchup ${item.index + 1}`
                              : "Awaiting entrant"
                          }
                          aria-pressed={Boolean(entry && item.winner?.id === entry.id)}
                          className={cn(
                            item.winner && item.winner.id === entry?.id && "tree-picked",
                          )}
                          onClick={() =>
                            entry &&
                            change(chooseWinner(initial.version.entrants, picks, item.id, entry.id))
                          }
                        >
                          <span>
                            {entry?.name ?? (item.status === "bye" ? "Bye" : "To be decided")}
                          </span>
                          {entry && item.winner?.id === entry.id && <CheckIcon />}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : tree.winner && !review ? (
        <div className="winner-stage">
          <TrophyIcon className="mx-auto mb-5 size-9 text-primary" weight="duotone" />
          <p className="holly-section-label">Winner</p>
          <EntrantArt entry={tree.winner} className="winner-art" />
          <h2>{tree.winner.name}</h2>
          <div className="mt-7 flex justify-center gap-3">
            <Button variant="outline" onClick={() => setView("tree")}>
              <TreeStructureIcon /> View bracket
            </Button>
            <Button variant="ghost" onClick={() => setResetOpen(true)}>
              Play again <ArrowRightIcon />
            </Button>
          </div>
        </div>
      ) : match ? (
        <section aria-label="Current matchup">
          <div className="mb-6 text-center">
            <p className="holly-section-label">
              {match.round === tree.rounds.length - 1 ? "The final" : `Round ${match.round + 1}`}{" "}
              <span className="px-2">/</span> Matchup {match.index + 1}
            </p>
          </div>
          <div className="matchup-stage">
            {[match.a, match.b].map(
              (entry, index) =>
                entry && (
                  <div key={entry.id} className="matchup-side">
                    {index === 1 && <span className="versus">or</span>}
                    <button
                      className="pick-card"
                      disabled={save.isPending}
                      onClick={() => pick(entry.id)}
                      aria-label={`Pick ${entry.name}`}
                    >
                      <EntrantArt entry={entry} />
                      <div className="pick-card-caption">
                        <span className="holly-section-label">
                          Seed{" "}
                          {initial.version.entrants.findIndex((item) => item.id === entry.id) + 1}
                        </span>
                        <h2>{entry.name}</h2>
                        <span className="pick-action">
                          Pick <ArrowRightIcon />
                        </span>
                      </div>
                    </button>
                  </div>
                ),
            )}
          </div>
        </section>
      ) : null}
      <div className="play-footer">
        <Button
          variant="ghost"
          size="sm"
          disabled={tree.completed === 0 || save.isPending}
          onClick={() => {
            const previous = tree.matches.filter((item) => item.status === "complete").at(-1);
            if (previous) {
              setReview(previous.id);
              setView("cards");
            }
          }}
        >
          <ArrowLeftIcon /> Revisit last pick
        </Button>
        {!savedRun && (
          <div className="flex flex-wrap items-center gap-3">
            {me.data?.user ? (
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(picks)}>
                <FloppyDiskIcon />
                {save.isPending ? "Saving…" : "Save run"}
              </Button>
            ) : (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<a href={loginURL()} />}
              >
                <FloppyDiskIcon /> Sign in to save
              </Button>
            )}
          </div>
        )}
      </div>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogTitle>Reset picks?</DialogTitle>
          <DialogDescription>
            Clears all picks in this run. Entrants and seeds stay the same.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                change({});
                setResetOpen(false);
              }}
            >
              Start over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
