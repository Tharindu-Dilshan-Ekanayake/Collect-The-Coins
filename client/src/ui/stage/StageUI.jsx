import { useEffect, useState } from 'react'

import { sfx } from '../../state/audio'
import { MODES } from '../../state/content'
import { useGame } from '../../state/game'
import { isTouchDevice } from '../../state/input'
import { useRun } from '../../state/run'
import { MAPS, RUN_UPGRADES, TOOLS, UPGRADE_GROUPS, bagCapacity, grabSize, upgradeCost } from '../../state/stageContent'
import {
  ArrowRightIcon,
  BagIcon,
  BoltIcon,
  BootIcon,
  ChestIcon,
  CloseIcon,
  CoinIcon,
  GoblinIcon,
  HandIcon,
  LockIcon,
  LodestoneIcon,
  RakeIcon,
  SackIcon,
  ScoopIcon,
  ScrollIcon,
  VacIcon,
} from '../icons'

/** Picture of each tool (hotbar and Tool Shelf). */
const TOOL_ICONS = { hands: HandIcon, scoop: ScoopIcon, rake: RakeIcon, vac: VacIcon, lodestone: LodestoneIcon }

/** Shiny tile behind a tool picture, in the tool's colour. */
const toolTile = (color) => ({
  background: `radial-gradient(circle at 50% 36%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 62%), ${color}`,
})

/**
 * The first-run guide: 1 grab coins, 2 carry them to the chest, 3 spend them on
 * upgrades. 0 once finished or skipped (saved, so it only ever shows once).
 */
function useTutorialStep() {
  const done = useGame((s) => s.tutorialDone)
  const bag = useRun((s) => s.bag)
  const earned = useRun((s) => s.earned)
  const result = useRun((s) => s.result)
  if (done || result) return 0
  if (earned > 0) return 3
  return bag > 0 ? 2 : 1
}

const fmt = (n) => Math.floor(n).toLocaleString('en-US')
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const MODAL_WIDTH = { md: 'max-w-md', xl: 'max-w-4xl', xxl: 'max-w-5xl' }

function Modal({ children, onClose, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => e.code === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-3 [@media(max-height:480px)]:p-1.5">
      <div
        className={`panel modal-fit animate-pop pointer-events-auto max-h-[calc(100dvh-1.5rem)] [@media(max-height:480px)]:max-h-[calc(100dvh-0.75rem)] w-full overflow-y-auto ${MODAL_WIDTH[size]}`}
      >
        {children}
      </div>
    </div>
  )
}

function PanelTitle({ children, sub }) {
  return (
    <div className="rounded-t-[18px] border-b-4 border-bark bg-[radial-gradient(circle_at_50%_120%,#ffc94d_0%,#3b2a5c_70%)] px-5 pt-4 pb-3 text-center [@media(max-height:480px)]:pt-2 [@media(max-height:480px)]:pb-1.5">
      <h2 className="title-outline text-3xl font-bold [@media(max-height:480px)]:text-2xl">{children}</h2>
      {sub && <p className="mt-1 text-sm font-semibold text-cream/90 [@media(max-height:480px)]:hidden">{sub}</p>}
    </div>
  )
}

/** Shop popup header in one short row: coins to spend, the title, and a close button. */
function PanelHeader({ title, sub, bank, onClose }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-[18px] border-b-4 border-bark bg-[radial-gradient(circle_at_50%_130%,#ffc94d_0%,#3b2a5c_68%)] px-3 py-2.5 sm:gap-3 sm:px-4">
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border-3 border-ink bg-cream py-0.5 pr-3 pl-0.5 shadow-[0_3px_0_#3b2414]">
        <CoinIcon className="h-8 w-8" />
        <span key={bank} className="animate-bump text-lg leading-none font-bold sm:text-xl">
          {fmt(bank)}
        </span>
      </div>
      <div className="min-w-0 flex-1 text-center">
        <h2 className="title-outline text-2xl leading-tight font-bold sm:text-3xl">{title}</h2>
        {sub && <p className="mt-0.5 truncate text-xs font-semibold text-cream/90 sm:text-sm [@media(max-height:480px)]:hidden">{sub}</p>}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          sfx('click')
          onClose()
        }}
        className="btn h-12 w-12 shrink-0 !rounded-full !p-0"
        style={{ '--btn': '#d9483b' }}
      >
        <CloseIcon className="h-6 w-6" />
      </button>
    </div>
  )
}

/** Re-renders every `ms` so clocks and hint toasts tick (UI only, not the 3D loop). */
function useNow(ms) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function Objective({ touch }) {
  const cleared = useRun((s) => s.cleared)
  const goal = useRun((s) => s.goal)
  const startedAt = useRun((s) => s.startedAt)
  const result = useRun((s) => s.result)
  const poolLeft = useRun((s) => s.poolLeft)
  const now = useNow(250)
  const seconds = result?.seconds ?? (now - startedAt) / 1000

  return (
    <>
      <div
        className={`panel pointer-events-none absolute right-3 z-10 !rounded-2xl sm:right-4 ${
          touch ? 'top-[4.6rem] w-36 px-2.5 py-1.5 text-sm' : 'top-20 w-56 px-3 py-2'
        }`}
      >
        <div className="text-xs font-bold tracking-wide text-bark/80">TREASURE BANKED</div>
        <div className={touch ? 'text-lg font-bold' : 'text-xl font-bold'}>
          {fmt(cleared)}
          <span className="text-base text-bark/70"> / {fmt(goal)}</span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full border-2 border-bark bg-white/60">
          <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.min(100, (cleared / goal) * 100)}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs font-bold text-bark/70">
          <span>{touch ? 'POOL' : 'LEFT IN POOL'}</span>
          <span className="whitespace-nowrap">{fmt(poolLeft)}</span>
        </div>
        <div className="mt-0.5 text-right text-base font-bold text-bark/80">{clock(seconds)}</div>
      </div>
    </>
  )
}

/** How many coins one grab takes right now (tool + Bigger Grab). */
function GrabChip() {
  const levels = useRun((s) => s.levels)
  const equipped = useRun((s) => s.equipped)
  const tool = TOOLS.find((t) => t.id === equipped) || TOOLS[0]
  const n = grabSize(tool, levels)
  return (
    <div key={n} className="panel animate-bump flex items-center gap-1.5 !rounded-full py-0.5 pr-3 pl-1.5 text-sm font-bold">
      <HandIcon className="h-6 w-6" />
      {n} coin{n === 1 ? '' : 's'} a grab
    </div>
  )
}

function BagAndBank({ touch }) {
  const bag = useRun((s) => s.bag)
  const pockets = useRun((s) => s.levels.pockets)
  const bank = useRun((s) => s.bank)
  const cap = bagCapacity(pockets)
  const full = bag >= cap
  if (touch) {
    return (
      <div className="pointer-events-none absolute top-[4.9rem] left-3 z-10 flex gap-2">
        <div className="panel flex items-center gap-1.5 !rounded-full py-0.5 pr-3 pl-1.5">
          <BagIcon className="h-6 w-6" />
          <span className={`text-base font-bold ${full ? 'text-[#d9483b]' : ''}`}>
            {fmt(bag)}
            <span className="text-xs text-bark/60">/{fmt(cap)}</span>
          </span>
        </div>
        <div className="panel flex items-center gap-1.5 !rounded-full py-0.5 pr-3 pl-1.5">
          <CoinIcon className="h-5 w-5" />
          <span className="text-base font-bold">{fmt(bank)}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute bottom-12 left-3 z-10 flex flex-col gap-2">
      <div className="panel flex items-center gap-2 !rounded-2xl py-1.5 pr-4 pl-2">
        <div className="relative">
          <BagIcon className="h-10 w-10" />
        </div>
        <div className="leading-tight">
          <div className="text-xs font-bold text-bark/70">BAG</div>
          <div key={bag} className={`animate-bump text-2xl font-bold ${full ? 'text-[#d9483b]' : ''}`}>
            {fmt(bag)}
            <span className="text-base text-bark/60"> / {fmt(cap)}</span>
          </div>
        </div>
      </div>
      <div className="panel flex items-center gap-2 !rounded-2xl py-1 pr-4 pl-2.5">
        <CoinIcon className="h-7 w-7" />
        <div className="leading-tight">
          <div className="text-xs font-bold text-bark/70">BANK</div>
          <div className="text-xl font-bold">{fmt(bank)}</div>
        </div>
      </div>
      <GrabChip />
    </div>
  )
}

function Hotbar({ touch, pulseUpgrades }) {
  const tools = useRun((s) => s.tools)
  const equipped = useRun((s) => s.equipped)
  const equip = useRun((s) => s.equip)
  const openPanel = useRun((s) => s.openPanel)
  // Six slots must fit a 360 px portrait phone, so touch slots scale with the width.
  const size = touch ? 'h-[min(4.5rem,14vw)] w-[min(4.5rem,14vw)]' : 'h-[5.5rem] w-[5.5rem]'
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${
        touch ? 'bottom-3 [@media(orientation:portrait)]:bottom-[9.5rem]' : 'bottom-3'
      }`}
    >
      <div className="pointer-events-auto flex items-end gap-2 sm:gap-2.5">
        {TOOLS.filter((t) => tools.includes(t.id)).map((t) => {
          const Icon = TOOL_ICONS[t.id] || HandIcon
          const on = equipped === t.id
          return (
            <button
              key={t.id}
              type="button"
              aria-label={t.name}
              onClick={() => {
                sfx('click')
                equip(t.id)
              }}
              className={`relative flex shrink-0 flex-col items-center justify-center rounded-2xl border-3 border-ink transition active:translate-y-1 ${size} ${
                on
                  ? '-translate-y-1.5 shadow-[0_6px_0_#3b2414,0_0_0_4px_#ffc83a,0_0_20px_6px_rgba(255,200,58,0.6)]'
                  : 'opacity-90 shadow-[0_5px_0_#3b2414] hover:opacity-100'
              }`}
              style={toolTile(t.color)}
            >
              {!touch && (
                <span className="absolute -top-2.5 -left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-cream bg-ink text-xs font-bold text-cream">
                  {t.key}
                </span>
              )}
              <Icon className={touch ? 'h-[72%] w-[72%]' : 'h-12 w-12'} />
              {!touch && (
                <span className="text-outline mt-0.5 text-[11px] leading-none font-bold text-white" style={{ WebkitTextStroke: '3px #3b2414' }}>
                  {t.name}
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          aria-label="Upgrades"
          onClick={() => {
            sfx('click')
            openPanel('upgrades')
          }}
          className={`btn ml-1 shrink-0 flex-col !gap-0 !rounded-2xl !p-0 text-xs ${size} ${pulseUpgrades ? 'animate-bounce ring-4 ring-white' : ''}`}
          style={{ '--btn': '#f2b53a' }}
        >
          <ScrollIcon className={touch ? 'h-[55%] w-[55%]' : 'h-11 w-11'} />
          <span className={`text-ink [text-shadow:none] ${touch ? 'text-[9px]' : ''}`}>{touch ? 'UPGRADES' : 'TAB'}</span>
        </button>
      </div>
    </div>
  )
}

function Prompts({ touch }) {
  const banking = useRun((s) => s.banking)
  const bag = useRun((s) => s.bag)
  const bankedThisVisit = useRun((s) => s.bankedThisVisit)
  const bagAtVisit = useRun((s) => s.bagAtVisit)
  const nearRack = useRun((s) => s.nearRack)
  const panel = useRun((s) => s.panel)
  const openPanel = useRun((s) => s.openPanel)
  const hint = useRun((s) => s.hint)
  const now = useNow(200)
  const showHint = hint && now - hint.at < 1600

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-2 ${
        touch ? 'bottom-24 [@media(orientation:portrait)]:bottom-64' : 'bottom-28'
      }`}
    >
      {showHint && (
        <div className="panel animate-pop !rounded-full px-4 py-1.5 text-base font-bold text-[#c0392b]">
          {hint.kind === 'full' ? 'Bag full! Bank it at a chest.' : 'Too far, get closer to the coins.'}
        </div>
      )}
      {banking && (bag > 0 || bankedThisVisit > 0) && bagAtVisit > 0 && (
        <div className="panel w-60 !rounded-2xl px-3 py-1.5 text-center">
          <div className="text-sm font-bold">{bag > 0 ? 'Banking…' : 'Banked!'}</div>
          <div className="mt-1 h-3 overflow-hidden rounded-full border-2 border-bark bg-white/60">
            <div className="h-full bg-leaf" style={{ width: `${Math.min(100, (bankedThisVisit / bagAtVisit) * 100)}%` }} />
          </div>
          <div className="text-xs font-bold text-bark/70">
            {fmt(bankedThisVisit)} / {fmt(bagAtVisit)}
          </div>
        </div>
      )}
      {nearRack && panel !== 'shop' &&
        (touch ? (
          <button
            type="button"
            onClick={() => {
              sfx('click')
              openPanel('shop')
            }}
            className="btn animate-pop pointer-events-auto min-h-14 !rounded-2xl px-4 text-lg"
            style={{ '--btn': '#f2b53a' }}
          >
            <ScoopIcon className="h-9 w-9" />
            <span className="text-ink [text-shadow:none]">TOOL SHELF</span>
          </button>
        ) : (
          <div className="panel animate-pop flex items-center gap-3 !rounded-2xl py-2 pr-5 pl-2.5">
            <span className="animate-keytap flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink bg-linear-to-b from-white to-[#eadcc0] text-2xl font-bold">
              E
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-bold">Press E</span>
              <span className="block text-sm font-semibold text-bark/80">to open the Tool Shelf</span>
            </span>
          </div>
        ))}
    </div>
  )
}

function ToolCard({ t, owned, active, bank, grab, highlight, onBuy, onEquip }) {
  const Icon = TOOL_ICONS[t.id] || HandIcon
  const affordable = !owned && bank >= t.price
  const locked = !owned && !affordable
  const ribbon = active ? ['IN HAND', '#3b82c4'] : highlight ? ['CAN BUY!', '#3fae3f'] : null
  return (
    <div
      className={`relative flex flex-col rounded-2xl border-3 p-2.5 transition ${
        active
          ? 'border-[#3b82c4] bg-[#e8f2fc] shadow-[0_0_0_3px_rgba(59,130,196,0.25)]'
          : affordable
            ? 'border-[#3fae3f] bg-[#eefae6] shadow-[0_0_0_3px_rgba(63,174,63,0.25)]'
            : 'border-bark/25 bg-white/55'
      }`}
    >
      {ribbon && (
        <span
          className={`absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-ink px-2.5 text-xs leading-5 font-bold whitespace-nowrap text-white ${
            highlight && !active ? 'animate-bounce' : ''
          }`}
          style={{ background: ribbon[1] }}
        >
          {ribbon[0]}
        </span>
      )}
      <div
        className="relative flex h-20 items-center justify-center rounded-xl border-3 border-ink shadow-[inset_0_-6px_0_rgba(0,0,0,0.18),inset_0_4px_0_rgba(255,255,255,0.35)] sm:h-24"
        style={toolTile(t.color)}
      >
        <Icon className={`h-14 w-14 drop-shadow-[0_3px_0_rgba(0,0,0,0.22)] sm:h-[4.5rem] sm:w-[4.5rem] ${locked ? 'opacity-60 grayscale-[0.4]' : ''}`} />
        <span className="absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-md border-2 border-ink bg-cream text-xs font-bold">
          {t.key}
        </span>
        {locked && <LockIcon className="absolute top-1 right-1 h-6 w-6" />}
      </div>
      <div className="mt-2 text-center text-base leading-tight font-bold">{t.name}</div>
      <div className="mt-0.5 hidden min-h-[2.5em] text-center text-[11px] leading-snug text-bark/75 sm:line-clamp-2">{t.desc}</div>
      <div className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-[#ffc83a]/30 py-1 font-bold">
        <CoinIcon className="h-5 w-5" />
        <span className="text-lg leading-none">{grab}</span>
        <span className="text-xs text-bark/75">a grab</span>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-1 text-[11px] font-bold text-bark/80">
        <span className="rounded-md bg-black/5 px-1.5">{t.radius} m reach</span>
        <span className="rounded-md bg-black/5 px-1.5">
          {t.rate} {t.passive ? 'pulls' : 'grabs'}/s
        </span>
      </div>
      <div className="mt-auto pt-2">
        {owned ? (
          <button
            type="button"
            disabled={active}
            onClick={onEquip}
            className="btn min-h-11 w-full px-2 py-2 text-base"
            style={{ '--btn': '#3b82c4' }}
          >
            {active ? 'Equipped' : 'Equip'}
          </button>
        ) : (
          <button
            type="button"
            disabled={!affordable}
            onClick={onBuy}
            className="btn min-h-11 w-full px-2 py-2 text-lg"
            style={{ '--btn': '#3fae3f' }}
          >
            <CoinIcon className="h-6 w-6" /> {fmt(t.price)}
          </button>
        )}
        <div className="mt-1 h-4 text-center text-[11px] leading-4 font-bold text-bark/70">
          {locked ? `Need ${fmt(t.price - bank)} more` : ''}
        </div>
      </div>
    </div>
  )
}

function ToolShop() {
  const levels = useRun((s) => s.levels)
  const bank = useRun((s) => s.bank)
  const tools = useRun((s) => s.tools)
  const equipped = useRun((s) => s.equipped)
  const buyTool = useRun((s) => s.buyTool)
  const equip = useRun((s) => s.equip)
  const closePanel = useRun((s) => s.closePanel)
  // TOOLS is sorted by price, so this is the cheapest tool you can buy right now.
  const next = TOOLS.find((t) => !tools.includes(t.id) && bank >= t.price)
  return (
    <Modal onClose={closePanel} size="xxl">
      <PanelHeader title="TOOL SHELF" sub="Better tools grab more coins with every swing." bank={bank} onClose={closePanel} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 p-3 pt-5 sm:grid-cols-3 sm:p-4 sm:pt-5 lg:grid-cols-5 [@media(min-width:600px)_and_(max-height:560px)]:grid-cols-5">
        {TOOLS.map((t) => (
          <ToolCard
            key={t.id}
            t={t}
            owned={tools.includes(t.id)}
            active={equipped === t.id}
            bank={bank}
            grab={grabSize(t, levels)}
            highlight={next?.id === t.id}
            onBuy={() => sfx(buyTool(t.id) ? 'buy' : 'error')}
            onEquip={() => {
              sfx('click')
              equip(t.id)
            }}
          />
        ))}
      </div>
    </Modal>
  )
}

const UPGRADE_ICONS = {
  pockets: BagIcon,
  deposit: ChestIcon,
  boots: BootIcon,
  steady: BoltIcon,
  haul: HandIcon,
  sprites: GoblinIcon,
  spriteSpeed: SackIcon,
}
const GROUP_STYLE = {
  gear: { icon: BootIcon, color: '#4f8fd6' },
  tools: { icon: HandIcon, color: '#e39b2b' },
  helpers: { icon: GoblinIcon, color: '#5fae4a' },
}

function UpgradeCard({ u, level, bank, blocked, onBuy }) {
  const maxed = level >= u.max
  const cost = upgradeCost(u, level)
  const affordable = !maxed && !blocked && bank >= cost
  const Icon = UPGRADE_ICONS[u.id] || ScrollIcon
  const style = GROUP_STYLE[u.group]
  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border-3 p-3 transition ${
        affordable
          ? 'border-[#3fae3f] bg-[#eefae6] shadow-[0_0_0_3px_rgba(63,174,63,0.22)]'
          : maxed
            ? 'border-gold bg-[#fff6d8]'
            : 'border-bark/25 bg-white/55'
      }`}
    >
      {maxed && (
        <span className="absolute -top-2.5 right-3 rounded-full border-2 border-ink bg-gold px-2 text-[11px] font-bold">MAXED</span>
      )}
      <div
        key={level}
        className="animate-pop relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-3 border-ink shadow-[inset_0_-6px_0_rgba(0,0,0,0.18),inset_0_4px_0_rgba(255,255,255,0.3)]"
        style={{ background: style.color }}
      >
        <Icon className="h-10 w-10" />
        <span className="absolute -right-2 -bottom-2 rounded-full border-2 border-ink bg-cream px-1.5 text-xs leading-5 font-bold">
          Lv {level}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg leading-tight font-bold">{u.name}</div>
        <div className="text-xs text-bark/80">{u.desc}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-bold">
          <span className="rounded-lg bg-black/5 px-2 py-0.5">
            <span className="text-bark/60">Now </span>
            {u.effect(level)}
          </span>
          {!maxed && (
            <>
              <ArrowRightIcon className="h-4 w-4 text-[#2f8a3a]" />
              <span className="rounded-lg bg-[#3fae3f]/15 px-2 py-0.5 text-[#23712e]">
                <span className="opacity-70">Next </span>
                {u.effect(level + 1)}
              </span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex gap-1">
          {Array.from({ length: u.max }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 rounded-full border-2 border-bark ${
                i < level ? 'bg-gold shadow-[0_0_6px_rgba(255,200,58,0.9)]' : 'bg-white/60'
              }`}
              style={{ maxWidth: '1.6rem' }}
            />
          ))}
        </div>
      </div>
      {blocked ? (
        <span className="flex w-28 flex-col items-center gap-1 rounded-xl bg-black/10 px-2 py-2 text-center text-xs font-bold text-bark">
          <LockIcon className="h-5 w-5" /> Needs {RUN_UPGRADES.find((r) => r.id === u.requires)?.name}
        </span>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            disabled={maxed || bank < cost}
            onClick={onBuy}
            className="btn min-h-12 min-w-28 px-4 py-2.5 text-lg"
            style={{ '--btn': maxed ? '#d9a441' : '#3fae3f' }}
          >
            {maxed ? (
              'MAX'
            ) : (
              <>
                <CoinIcon className="h-6 w-6" /> {fmt(cost)}
              </>
            )}
          </button>
          {!maxed && bank < cost && <span className="text-[11px] font-bold text-bark/70">Need {fmt(cost - bank)} more</span>}
        </div>
      )}
    </div>
  )
}

function UpgradeBook() {
  const bank = useRun((s) => s.bank)
  const levels = useRun((s) => s.levels)
  const buyUpgrade = useRun((s) => s.buyUpgrade)
  const closePanel = useRun((s) => s.closePanel)
  const [group, setGroup] = useState('gear')
  const current = UPGRADE_GROUPS.find((g) => g.id === group)
  const canBuy = (u) => {
    const level = levels[u.id] || 0
    return level < u.max && !(u.requires && !levels[u.requires]) && bank >= upgradeCost(u, level)
  }

  return (
    <Modal onClose={closePanel} size="xl">
      <PanelHeader title="UPGRADES" sub={current.blurb} bank={bank} onClose={closePanel} />
      <nav className="grid grid-cols-3 gap-2 px-3 pt-3 sm:px-4">
        {UPGRADE_GROUPS.map((g) => {
          const GroupIcon = GROUP_STYLE[g.id].icon
          const ready = RUN_UPGRADES.filter((u) => u.group === g.id && canBuy(u)).length
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                sfx('click')
                setGroup(g.id)
              }}
              className={`btn relative min-h-12 px-2 py-2 text-base ${group === g.id ? 'ring-4 ring-white' : ''}`}
              style={{ '--btn': group === g.id ? GROUP_STYLE[g.id].color : '#a08060' }}
            >
              <GroupIcon className="h-7 w-7 shrink-0" />
              {g.label}
              {ready > 0 && (
                <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-[#e8385a] px-1 text-xs">
                  {ready}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
        {RUN_UPGRADES.filter((u) => u.group === group).map((u) => (
          <UpgradeCard
            key={u.id}
            u={u}
            level={levels[u.id] || 0}
            bank={bank}
            blocked={Boolean(u.requires && !levels[u.requires])}
            onBuy={() => sfx(buyUpgrade(u.id) ? 'buy' : 'error')}
          />
        ))}
      </div>
    </Modal>
  )
}

/** The first-run guide bubble (and a pulse on the crosshair for step 1). */
function TutorialCoach({ touch, step }) {
  const finish = useGame((s) => s.finishTutorial)
  const banking = useRun((s) => s.banking)
  const panel = useRun((s) => s.panel)
  // Step 3 ends when they open the upgrades, or after a while.
  useEffect(() => {
    if (step === 3 && panel === 'upgrades') finish()
  }, [step, panel, finish])
  useEffect(() => {
    if (step !== 3) return undefined
    const id = setTimeout(finish, 15000)
    return () => clearTimeout(id)
  }, [step, finish])
  if (!step || (panel && step !== 3)) return null
  const text = {
    1: touch ? 'Tap the gold coins to grab them!' : 'Aim at the gold coins and click to grab them!',
    2: banking ? 'Stay at the chest while your bag empties into it…' : 'Nice! Carry your coins to the chest. Follow the big arrow!',
    3: touch ? 'Banked! Tap UPGRADES to grab more coins at once.' : 'Banked! Press TAB for Upgrades and grab more coins at once.',
  }[step]
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[9.5rem] z-20 flex justify-center px-3 sm:top-24">
        <div key={step} className="panel animate-pop pointer-events-auto flex max-w-md items-center gap-3 !rounded-2xl px-4 py-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-3 border-ink bg-gold text-xl font-bold">
            {step}
          </span>
          <div className="text-base leading-snug font-bold">{text}</div>
          <button type="button" onClick={finish} className="ml-1 shrink-0 text-xs font-bold text-bark/60 underline">
            Skip
          </button>
        </div>
      </div>
      {step === 1 && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-4 border-gold" />
      )}
    </>
  )
}

function Results({ result }) {
  useEffect(() => {
    if (result.won) sfx('win')
  }, [result.won])
  const modeId = useRun((s) => s.modeId)
  const returnToLobby = useGame((s) => s.returnToLobby)
  const online = useRun((s) => Boolean(s.net))
  const mode = MODES.find((m) => m.id === modeId)
  const index = MAPS.findIndex((m) => m.id === modeId)
  const next = result.won ? MAPS[index + 1] : null

  // After a clear the whole team heads back to the lobby together and dances. Online
  // the server sends everyone to one lobby; this timer is only the fallback.
  const [left, setLeft] = useState(7)
  useEffect(() => {
    if (!result.won) return undefined
    const id = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [result.won])
  useEffect(() => {
    if (result.won && left <= (online ? -3 : 0)) returnToLobby({ unlocked: next?.name || null })
  }, [result.won, left, online, next, returnToLobby])
  return (
    <Modal onClose={() => {}}>
      <PanelTitle sub={`Chapter ${index + 1} · ${mode?.name || ''}`}>{result.won ? 'Map cleared!' : 'Run over'}</PanelTitle>
      <div className="space-y-3 p-5 text-center">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-black/5 p-3">
            <div className="text-xs font-bold text-bark/70">COINS BANKED</div>
            <div className="text-2xl font-bold">{fmt(result.cleared)}</div>
          </div>
          <div className="rounded-2xl bg-black/5 p-3">
            <div className="text-xs font-bold text-bark/70">TIME</div>
            <div className="text-2xl font-bold">{clock(result.seconds)}</div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 text-2xl font-bold text-[#a06a00]">
          + {fmt(result.coins)} <CoinIcon className="h-8 w-8" />
          <span className="text-base text-bark/70">kept</span>
        </div>
        {next && (
          <div className="rounded-2xl border-3 border-[#3fae3f] bg-[#3fae3f]/15 p-2 font-bold">
            New map unlocked: {next.name}!
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            sfx('click')
            returnToLobby(result.won ? { unlocked: next?.name || null } : null)
          }}
          className="btn w-full py-3 text-xl"
          style={{ '--btn': '#3fae3f' }}
        >
          {result.won ? `BACK TO LOBBY (${Math.max(0, left)})` : 'BACK TO LOBBY'}
        </button>
      </div>
    </Modal>
  )
}

/** Centre crosshair: the first-person aim. */
function Crosshair() {
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <div className="h-3.5 w-3.5 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(59,36,20,0.7)]" />
    </div>
  )
}

/** Floating "+N" next to the crosshair for every grab. */
function GrabPopups() {
  const [pops, setPops] = useState([])
  useEffect(
    () =>
      useRun.subscribe((s, prev) => {
        if (s.lastGrab && s.lastGrab !== prev.lastGrab) {
          const id = s.lastGrab.at + Math.random()
          setPops((list) => [...list.slice(-5), { id, amount: s.lastGrab.amount, dx: (Math.random() - 0.5) * 50 }])
          setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), 900)
        }
      }),
    [],
  )
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10">
      {pops.map((p) => (
        <div
          key={p.id}
          className="title-outline animate-float-up absolute text-2xl font-bold whitespace-nowrap text-[#ffd34d]"
          style={{ left: 18 + p.dx, top: -10, WebkitTextStroke: '5px #3b2414' }}
        >
          +{p.amount}
        </div>
      ))}
    </div>
  )
}

/** Number keys pick tools, Tab/U toggles upgrades, E opens/closes the shelf when close. */
function useStageKeys() {
  useEffect(() => {
    const onKey = (e) => {
      const run = useRun.getState()
      if (run.result) return
      const tool = TOOLS.find((t) => `Digit${t.key}` === e.code)
      if (tool) {
        run.equip(tool.id)
        return
      }
      if (e.code === 'Tab' || e.code === 'KeyU') {
        e.preventDefault()
        if (run.panel === 'upgrades') run.closePanel()
        else run.openPanel('upgrades')
      } else if (e.code === 'KeyE' && run.panel === 'shop') {
        run.closePanel()
      } else if (e.code === 'KeyE' && run.nearRack) {
        sfx('click')
        run.openPanel('shop')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Everything on screen during a stage run. Lazy-loaded with the stage. */
export default function StageUI() {
  useStageKeys()
  const touch = isTouchDevice()
  const panel = useRun((s) => s.panel)
  const result = useRun((s) => s.result)
  const startedAt = useRun((s) => s.startedAt)
  const tutorial = useTutorialStep()
  if (!startedAt) return null

  return (
    <>
      <Objective touch={touch} />
      <BagAndBank touch={touch} />
      <Hotbar touch={touch} pulseUpgrades={tutorial === 3} />
      <TutorialCoach touch={touch} step={tutorial} />
      <Prompts touch={touch} />
      {!touch && !panel && !result && <Crosshair />}
      <GrabPopups />
      {panel === 'shop' && <ToolShop />}
      {panel === 'upgrades' && <UpgradeBook />}
      {result && !result.left && <Results result={result} />}
    </>
  )
}
