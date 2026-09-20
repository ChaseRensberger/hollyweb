import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, TrophyIcon } from "@phosphor-icons/react";
import { Button } from "@hollyweb/core/components/core/button";

export function Home() {
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <p className="holly-section-label flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" /> Hollyweb
          </p>
          <h1>Brackets</h1>
          <p className="hero-description">8–64 entrants · Single elimination</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button nativeButton={false} size="lg" render={<Link to="/new" />}>
              New bracket <ArrowRightIcon />
            </Button>
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<Link to="/b/$shareID" params={{ shareID: "comfort-food" }} />}
            >
              Open example <ArrowUpRightIcon />
            </Button>
          </div>
        </div>
        <div className="hero-board" aria-label="Example bracket with Ramen as the winner">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <span className="holly-section-label">Example bracket</span>
            <span className="text-[10px] font-mono text-muted-foreground">FINAL FOUR</span>
          </div>
          <div className="demo-tree">
            <div className="demo-round">
              <div className="demo-match">
                <span>
                  01 <b>Pizza</b>
                </span>
                <span className="picked">
                  04 <b>Ramen</b>
                  <CheckIcon />
                </span>
              </div>
              <div className="demo-match">
                <span className="picked">
                  02 <b>Tacos</b>
                  <CheckIcon />
                </span>
                <span>
                  03 <b>Burgers</b>
                </span>
              </div>
            </div>
            <div className="demo-connector" />
            <div className="demo-round final">
              <div className="demo-match">
                <span className="picked">
                  04 <b>Ramen</b>
                  <CheckIcon />
                </span>
                <span>
                  02 <b>Tacos</b>
                </span>
              </div>
              <div className="demo-champion">
                <TrophyIcon weight="duotone" />
                <span className="holly-section-label">Winner</span>
                <strong>Ramen</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
