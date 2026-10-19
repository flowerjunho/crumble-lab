import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stagesQuery } from '../../api/queries'
import { useI18n, type Translate } from '../../i18n'
import { formatCeil, formatMillions, formatMillionsUnit, formatPercent } from '../../lib/format'
import { readStorage, writeStorage } from '../../lib/storage'
import { readTeamPower, writeTeamPower } from '../../lib/teamPower'
import {
  DEBUFF_RATE_OPTIONS,
  DEMO_FORM,
  EMPTY_FORM,
  EXAMPLE_FORM,
  MAX_CHAPTER,
  STAGES_PER_CHAPTER,
  canShiftStage,
  computeNormalStage,
  parseStoredForm,
  shiftStage,
  type NormalStageForm,
  type NormalStageResult,
} from '../../lib/normalStage'
import type { Locale, StagePos } from '../../types'
import { localizedText } from '../../lib/localize'
import { NumberCombobox, type ComboOption } from '../../components/NumberCombobox'

const FORM_KEY = 'crumble.stage.v2'
const POWER_OPEN_KEY = 'crumble.stage.power-open'
const CHAPTER_OPTIONS: ComboOption[] = Array.from({ length: MAX_CHAPTER }, (_, i) => ({ value: i + 1 }))
const STAGE_NUMBERS = Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => i + 1)

function isDemoUrl(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('demo') === '1' || params.get('fill') === '1'
}

function AnswerValue({ children, unit = '' }: { children: ReactNode; unit?: string }) {
  return (
    <div className="answer-value">
      {children}
      <small>{unit}</small>
    </div>
  )
}

const stageLabel = (pos: StagePos) => `${pos.ch}–${pos.st}`

/** 현재·다음 구간과 표에 나오는 구간만 골라 막대로 보여 준다. */
function DamageLadder({ result, t }: { result: NormalStageResult; t: Translate }) {
  const { locale } = useI18n()
  const current = result.penalty?.multiplier
  const next = result.nextTarget?.multiplier
  const bands = result.bands.filter(
    (band) =>
      result.targets.some((target) => target.multiplier === band.multiplier) ||
      band.multiplier === current ||
      band.multiplier === next,
  )
  return (
    <div className="damage-ladder" role="list" aria-label={t('주요 피해 구간과 현재·다음 위치')}>
      {bands.map((band) => {
        const state = band.multiplier === current ? 'current' : band.multiplier === next ? 'next' : ''
        return (
          <div
            key={band.multiplier}
            className={`damage-step ${state}`}
            role="listitem"
            title={t('팀 전투력 {power}부터', { power: formatMillionsUnit(band.power, locale) })}
          >
            <span className="step-state">{state ? t(state === 'current' ? '현재' : '다음') : ' '}</span>
            <b>{formatPercent(band.multiplier)}</b>
            <span className="step-bar" aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}

/** 목표 스테이지를 고르자마자 보여 주는 구간별 권장 전투력(5%~100%). */
const STRIP_MULTIPLIERS = [0.05, 0.15, 0.35, 0.55, 0.75, 1]

function BandPowerStrip({ result, t, locale }: { result: NormalStageResult; t: Translate; locale: Locale }) {
  const current = result.penalty?.multiplier
  const next = result.nextTarget?.multiplier
  const bands = result.bands.filter((band) => STRIP_MULTIPLIERS.includes(band.multiplier))
  return (
    <section className="panel band-strip" aria-labelledby="band-strip-title">
      <div className="band-strip-head">
        <h3 id="band-strip-title">{t('피해 구간별 권장 전투력')}</h3>
        <span className="subtle">{t('{stage} 기준', { stage: `${result.ch}–${result.st}` })}</span>
      </div>
      <ul className="band-strip-list">
        {bands.map((band) => {
          const state = band.multiplier === current ? 'current' : band.multiplier === next ? 'next' : ''
          const met = result.cp !== null && result.cp >= band.power
          return (
            <li key={band.multiplier} className={`${state ? `is-${state}` : ''} ${met ? 'is-met' : ''}`}>
              <span className="band-strip-rate">
                {t('피해 {rate}', { rate: formatPercent(band.multiplier) })}
                {state && <em>{t(state === 'current' ? '현재' : '다음')}</em>}
              </span>
              <b>{formatMillionsUnit(band.power, locale)}</b>
              {result.cp !== null && (
                <small className={met ? 'good' : 'warning'}>
                  {met
                    ? t('현재 충족')
                    : t('+{power} 필요', { power: formatMillionsUnit(band.power - result.cp, locale) })}
                </small>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PowerOutput({ result, t, locale }: { result: NormalStageResult; t: Translate; locale: Locale }) {
  if (!result.row) {
    return (
      <>
        <AnswerValue>—</AnswerValue>
        <p className="answer-status">{t('목표 스테이지를 입력하면 내 피해 구간과 필요한 전투력이 나옵니다.')}</p>
      </>
    )
  }
  if (result.cp === null || !result.penalty) {
    return (
      <>
        <p className="metric-label">{t('피해 100%에 필요한 팀 전투력')}</p>
        <AnswerValue unit="M">{formatMillions(result.row[2], locale)}</AnswerValue>
        <p className="answer-status">{t('내 팀 전투력을 넣으면 현재 구간과 부족분을 비교합니다.')}</p>
        <DamageLadder result={result} t={t} />
      </>
    )
  }
  const next = result.nextTarget
  return (
    <>
      <div className="power-overview">
        <div className="current-band">
          <span>{t('현재 피해')}</span>
          <strong>{formatPercent(result.penalty.multiplier)}</strong>
          <small>{t('내 전투력 {power}', { power: formatMillionsUnit(result.cp, locale) })}</small>
        </div>
        <span className="band-arrow" aria-hidden="true">
          →
        </span>
        <div className="next-band">
          <span>{t(next ? '다음 목표' : '최고 구간 달성')}</span>
          <strong>{formatPercent(next?.multiplier ?? result.penalty.multiplier)}</strong>
          <small>
            {next ? t('목표 {power}', { power: formatMillionsUnit(next.power, locale) }) : t('전투력 보너스 최대 적용')}
          </small>
        </div>
      </div>
      <DamageLadder result={result} t={t} />
      {next ? (
        <div className="power-gap">
          <p className="metric-label">{t('다음 구간까지 더 필요한 전투력')}</p>
          <AnswerValue unit="M">+{formatMillions(Math.max(0, next.power - result.cp), locale)}</AnswerValue>
          <p className="answer-status">
            {t('달성하면 피해')}{' '}
            <b>
              {formatPercent(result.penalty.multiplier)} → {formatPercent(next.multiplier)}
            </b>
          </p>
        </div>
      ) : (
        <p className="answer-status good max-band-note">{t('현재 전투력으로 최고 피해 구간을 충족했습니다.')}</p>
      )}
    </>
  )
}

function StatOutput({
  kind,
  result,
  debuffRate,
  t,
  locale,
}: {
  kind: 'accuracy' | 'focus'
  result: NormalStageResult
  debuffRate: string
  t: Translate
  locale: Locale
}) {
  const isAccuracy = kind === 'accuracy'
  const needed = isAccuracy ? result.accuracyNeeded : result.focusNeeded
  const mine = result[kind]
  if (needed === null) {
    return (
      <>
        <AnswerValue>—</AnswerValue>
        <p className="answer-status">
          {t(isAccuracy ? '목표 스테이지를 넣으면 필요한 명중이 나옵니다.' : '목표 스테이지를 입력하면 필요한 집중이 나옵니다.')}
        </p>
      </>
    )
  }
  const statusClass = mine ? (mine.missing > 0 ? 'warning' : 'good') : ''
  return (
    <>
      <p className="metric-label">
        {t(isAccuracy ? '적중률 100%에 필요한 명중' : '기본 적용률 {rate} → 적용률 100%에 필요한 집중', {
          rate: formatPercent(Number(debuffRate) / 1e4),
        })}
      </p>
      <AnswerValue>{formatCeil(needed, locale)}</AnswerValue>
      <p className={`answer-status ${statusClass}`}>
        {mine ? (
          mine.missing > 0 ? (
            <>
              <b>{t('지금보다 {value} 더 필요', { value: formatCeil(mine.missing, locale) })}</b>
              {' · '}
              {t(isAccuracy ? '현재 적중률 {rate}' : '현재 적용률 {rate}', { rate: formatPercent(mine.rate) })}
            </>
          ) : (
            t(isAccuracy ? '현재 명중으로 충족' : '현재 집중으로 충족')
          )
        ) : (
          t(isAccuracy ? '내 명중을 넣으면 부족분도 비교합니다.' : '내 집중을 넣으면 부족분도 비교합니다.')
        )}
      </p>
    </>
  )
}

export function NormalStage() {
  const { t, locale } = useI18n()
  const [demoMode] = useState(isDemoUrl)
  const [form, setForm] = useState<NormalStageForm>(() => {
    if (demoMode) return { ...DEMO_FORM }
    const saved = parseStoredForm(readStorage(FORM_KEY)) ?? { ...EMPTY_FORM }
    // 팀 전투력은 차원의 이면과 같이 쓰는 값을 우선한다.
    const sharedPower = readTeamPower()
    return sharedPower === null ? saved : { ...saved, cpM: sharedPower }
  })
  const [exampleMode, setExampleMode] = useState(false)
  const contextRef = useRef<HTMLDivElement>(null)
  const powerInputRef = useRef<HTMLInputElement>(null)
  // 팀 전투력 입력은 기본으로 접어 두고, 펼친 상태는 다음 접속에도 유지한다.
  const [powerOpen, setPowerOpen] = useState(() => readStorage(POWER_OPEN_KEY) === '1')
  const togglePower = () => {
    const next = !powerOpen
    setPowerOpen(next)
    writeStorage(POWER_OPEN_KEY, next ? '1' : '0')
    // 펼치면 바로 입력할 수 있게 포커스를 옮긴다. hidden이 풀린 뒤에 실행해야 한다.
    if (next) requestAnimationFrame(() => powerInputRef.current?.focus())
  }
  const stages = useQuery(stagesQuery)

  // 예시 값이나 ?demo 링크로 채운 값은 저장하지 않는다.
  useEffect(() => {
    if (demoMode || exampleMode) return
    writeStorage(FORM_KEY, JSON.stringify(form))
    writeTeamPower(form.cpM)
  }, [form, demoMode, exampleMode])

  const outcome = useMemo(
    () => (stages.data ? computeNormalStage(stages.data, form, locale) : null),
    [stages.data, form, locale],
  )
  const result = outcome && outcome.error === null ? outcome : null
  const errorMessage = outcome?.error ?? null

  const update = (key: keyof NormalStageForm, value: string) => {
    setExampleMode(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // 스테이지 목록에는 고른 챕터의 보스 이름을 함께 보여 준다.
  const chapterNo = Number(form.ch)
  const stageOptions = useMemo<ComboOption[]>(() => {
    const data = stages.data
    return STAGE_NUMBERS.map((st) => {
      const row = data?.rows.find((r) => r[0] === chapterNo && r[1] === st)
      const boss = row && row[5] >= 0 ? localizedText(data!.bosses[row[5]]?.[0], locale) : ''
      return { value: st, hint: boss || undefined }
    })
  }, [stages.data, chapterNo, locale])

  const position: StagePos = { ch: Number(form.ch), st: Number(form.st) }
  const positionValid =
    Number.isInteger(position.ch) &&
    position.ch >= 1 &&
    position.ch <= MAX_CHAPTER &&
    Number.isInteger(position.st) &&
    position.st >= 1 &&
    position.st <= STAGES_PER_CHAPTER

  const goToStage = (pos: StagePos, scroll = false) => {
    setExampleMode(false)
    setForm((prev) => ({ ...prev, ch: String(pos.ch), st: String(pos.st) }))
    if (scroll) contextRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const placeholder = (
    <p className="result-placeholder">
      {t(
        errorMessage
          ? '입력값을 수정하면 결과가 표시됩니다.'
          : stages.isError
            ? '스테이지 데이터를 불러오지 못했습니다. 새로고침해 주세요.'
            : '스테이지 데이터를 불러오고 있습니다.',
      )}
    </p>
  )

  const penalty = result?.penalty
  const formClass = result && result.cp !== null && !result.row ? 'power-only' : ''

  return (
    <section id="stage-page" aria-label={t('스테이지 계산')}>
      <div className="section-intro">
        <div>
          <h2>{t('얼마나 더 올려야 할까요?')}</h2>
          <p>{t('목표 스테이지의 부족한 전투력·명중과 내 전투력의 도전 범위를 확인하세요.')}</p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setExampleMode(true)
            setForm({ ...EXAMPLE_FORM })
          }}
        >
          {t('예시 넣기')}
        </button>
      </div>

      <form
        id="stage-form"
        noValidate
        className={formClass}
        onSubmit={(e) => e.preventDefault()}
        onReset={(e) => {
          e.preventDefault()
          setExampleMode(false)
          setForm({ ...EMPTY_FORM })
        }}
      >
        <div className="panel stage-inputs">
          <fieldset className="stage-field">
            <legend>{t('목표 스테이지')}</legend>
            <div className="stage-input-row">
              <button
                type="button"
                className="step-button"
                aria-label={t('이전 스테이지')}
                disabled={!positionValid || !canShiftStage(position, -1)}
                onClick={() => goToStage(shiftStage(position, -1))}
              >
                −
              </button>
              <NumberCombobox
                id="chapter"
                label={t('챕터')}
                placeholder="114"
                value={form.ch}
                options={CHAPTER_OPTIONS}
                onChange={(value) => update('ch', value)}
              />
              <span className="stage-dash" aria-hidden="true">
                –
              </span>
              <NumberCombobox
                id="stage"
                label={t('스테이지')}
                placeholder="22"
                value={form.st}
                options={stageOptions}
                align="end"
                onChange={(value) => update('st', value)}
              />
              <button
                type="button"
                className="step-button"
                aria-label={t('다음 스테이지')}
                disabled={!positionValid || !canShiftStage(position, 1)}
                onClick={() => goToStage(shiftStage(position, 1))}
              >
                +
              </button>
            </div>
            <p className="field-hint">{t('챕터 – 스테이지 · 필요한 전투력과 명중 확인')}</p>
          </fieldset>

          <div className="form-actions">
            {(exampleMode || demoMode) && <span className="example-tag">{t('예시 값')}</span>}
            <button type="reset" className="text-button">
              {t('초기화')}
            </button>
          </div>

          {/* 접어 둔 상태에서도 입력한 전투력은 버튼에 보여 준다. */}
          <div className={`power-field ${powerOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="power-toggle"
              aria-expanded={powerOpen}
              aria-controls="power-panel"
              onClick={togglePower}
            >
              <span className="power-toggle-label">{t('현재 팀 전투력')}</span>
              {form.cpM && <span className="power-toggle-value">{form.cpM} M</span>}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div id="power-panel" className="power-panel" hidden={!powerOpen}>
              <div className="unit-field">
                <input
                  ref={powerInputRef}
                  id="power"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder={t('예: 105')}
                  aria-label={t('현재 팀 전투력')}
                  aria-describedby="power-hint"
                  value={form.cpM}
                  onChange={(e) => update('cpM', e.target.value)}
                />
                <span>M</span>
              </div>
              <p id="power-hint" className="field-hint">
                {t('편성 화면의 팀 합계 · 1억 = 100M')}
              </p>
            </div>
          </div>
        </div>

        <p className="input-guide">
          {t('하나만 입력해도 됩니다.')} <b>{t('스테이지')}</b> → {t('필요 수치')} / <b>{t('전투력')}</b> →{' '}
          {t('도전 범위')} / <b>{t('둘 다')}</b> → {t('부족분까지')}
        </p>

        <p className="error" role="alert">
          {errorMessage
            ? t(errorMessage)
            : stages.isError
              ? t('스테이지 데이터를 불러오지 못했습니다. 새로고침해 주세요.')
              : ''}
        </p>

        <div id="stage-context" ref={contextRef} className="stage-context" aria-live="polite">
          {result?.row && (
            <>
              <b>
                {result.ch}–{result.st}
              </b>
              <span>{result.boss || t('목표 스테이지')}</span>
              {penalty && (
                <span className={`damage-status ${penalty.multiplier < 1 ? 'warning' : 'good'}`}>
                  {t(
                    penalty.multiplier < 1
                      ? '전투력 부족으로 피해 {rate} 감소'
                      : penalty.multiplier === 1
                        ? '전투력에 따른 피해 감소 없음'
                        : '전투력 보너스로 피해 {rate} 증가',
                    { rate: formatPercent(Math.abs(penalty.multiplier - 1)) },
                  )}
                </span>
              )}
            </>
          )}
        </div>

        {result?.row && <BandPowerStrip result={result} t={t} locale={locale} />}

        <div className="primary-checks">
          <section className="check-card power-card" aria-labelledby="power-title">
            <h3 id="power-title">{t('내 피해 구간과 다음 목표')}</h3>
            <div id="power-output" aria-live="polite">
              {result ? <PowerOutput result={result} t={t} locale={locale} /> : placeholder}
            </div>
          </section>

          <section className="check-card" aria-labelledby="accuracy-title">
            <h3 id="accuracy-title">{t('빗나가지 않으려면 명중은?')}</h3>
            <div id="accuracy-output" aria-live="polite">
              {result ? (
                <StatOutput kind="accuracy" result={result} debuffRate={form.debuffRate} t={t} locale={locale} />
              ) : (
                placeholder
              )}
            </div>
            <label className="inline-stat" htmlFor="accuracy">
              <span>
                {t('내 쿠키 명중')} <small>{t('부족분 비교용')}</small>
              </span>
              <input
                id="accuracy"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder={t('선택 입력')}
                value={form.accuracy}
                onChange={(e) => update('accuracy', e.target.value)}
              />
            </label>
            <p className="field-hint">{t('딜러 한 명의 명중입니다. 별도 명중률 보정·동행 펫은 미포함.')}</p>
          </section>
        </div>

        <section className="panel reach-section" aria-labelledby="reach-title">
          <div className="section-heading">
            <h3 id="reach-title">{t('이 전투력이면 어디까지 도전할까?')}</h3>
            <p>{t('현재 전투력으로 각 피해 비율 이상을 유지할 수 있는 마지막 스테이지입니다.')}</p>
          </div>

          <div id="current-reach" aria-live="polite">
            {result?.currentReach && result.cp !== null && (
              <div className="current-reach-summary">
                <div>
                  <p className="current-reach-label">
                    {t('현재 피해 {rate}가 유지되는 마지막 스테이지', {
                      rate: formatPercent(result.currentReach.multiplier),
                    })}
                  </p>
                  <p className="current-reach-limit">
                    <strong>{stageLabel(result.currentReach.limit)}</strong>
                    <span>{t('까지 유지')}</span>
                  </p>
                </div>
                <div className="current-reach-detail">
                  <p>{t('내 전투력 {power} 기준', { power: formatMillionsUnit(result.cp, locale) })}</p>
                  <p>
                    {result.currentReach.limitNext
                      ? t('{stage}부터 피해가 {rate} 미만으로 내려갑니다.', {
                          stage: stageLabel(result.currentReach.limitNext),
                          rate: formatPercent(result.currentReach.multiplier),
                        })
                      : t('현재 데이터의 마지막 스테이지까지 유지됩니다.')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <p className="damage-explainer">
            <b>{t('피해 55%란?')}</b> {t('전투력 보정 전 피해를 100%로 봤을 때, 실제로 55%가 적용된다는 뜻입니다.')}
          </p>

          <div id="stage-output" aria-live="polite">
            {result ? (
              <div className="reach-table" role="table" aria-label={t('전투력별 피해와 도전 범위')}>
                <div className="reach-row reach-head" role="row">
                  <span role="columnheader">{t('적에게 주는 피해')}</span>
                  <span role="columnheader">
                    {t('목표 전투력')}
                    <small>
                      {result.row
                        ? t('{stage} 기준', { stage: `${result.ch}–${result.st}` })
                        : t('스테이지 기준')}
                    </small>
                  </span>
                  <span role="columnheader">
                    {t('피해 유지 범위')}
                    <small>
                      {result.cp === null
                        ? t('내 전투력 기준')
                        : t('내 전투력 {power}', { power: formatMillionsUnit(result.cp, locale) })}
                    </small>
                  </span>
                </div>
                {result.targets.map((target) => {
                  const state =
                    target.multiplier === penalty?.multiplier
                      ? 'current'
                      : target.multiplier === result.nextTarget?.multiplier
                        ? 'next'
                        : ''
                  const cp = result.cp
                  return (
                    <div key={target.multiplier} className={`reach-row ${state ? `is-${state}` : ''}`} role="row">
                      <div role="cell" data-label={t('적에게 주는 피해')}>
                        <div className="reach-band-label">
                          <b>{formatPercent(target.multiplier)}</b>
                          {state && (
                            <span className={`band-pill ${state}`}>{t(state === 'current' ? '현재' : '다음 목표')}</span>
                          )}
                        </div>
                        <small>
                          {target.multiplier === 1
                            ? t('피해 감소 없음')
                            : t('피해 {rate} 감소', { rate: formatPercent(1 - target.multiplier) })}
                        </small>
                      </div>
                      <div role="cell" data-label={t('목표 전투력')}>
                        <b>{target.power === null ? '—' : formatMillionsUnit(target.power, locale)}</b>
                        <small
                          className={cp !== null && target.power !== null ? (cp < target.power ? 'warning' : 'good') : ''}
                        >
                          {target.power === null
                            ? t('스테이지 입력 필요')
                            : cp === null
                              ? t('전투력 입력 시 부족분 표시')
                              : cp < target.power
                                ? t('+{power} 필요', { power: formatMillionsUnit(target.power - cp, locale) })
                                : t('현재 충족')}
                        </small>
                      </div>
                      <div role="cell" data-label={t('피해 유지 범위')}>
                        {target.limit ? (
                          <>
                            <button
                              className="reach-jump"
                              type="button"
                              aria-label={t('{stage} 스테이지 확인', {
                                stage: `${target.limit.ch}-${target.limit.st}`,
                              })}
                              onClick={() => goToStage(target.limit!, true)}
                            >
                              {stageLabel(target.limit)}
                              <span>{t('까지')}</span>
                            </button>
                            <small className="reach-maintain">
                              {t('피해 {rate} 이상 유지', { rate: formatPercent(target.multiplier) })}
                            </small>
                            <small className="reach-after">
                              {target.limitNext
                                ? t('{stage}부터 {rate} 미만', {
                                    stage: stageLabel(target.limitNext),
                                    rate: formatPercent(target.multiplier),
                                  })
                                : t('현재 데이터의 마지막 스테이지')}
                            </small>
                          </>
                        ) : (
                          <>
                            <b>—</b>
                            <small>{t(cp === null ? '팀 전투력 입력 필요' : '유지 가능한 구간 없음')}</small>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              placeholder
            )}
          </div>
          <p className="field-hint">
            {t(
              '스테이지를 누르면 그곳의 필요 전투력과 명중을 확인합니다. 피해 비율은 클리어 확률이 아니며, 실제 클리어는 조합·스킬·생존에 따라 달라집니다.',
            )}
          </p>
        </section>

        <section className="panel focus-section" aria-labelledby="focus-title">
          <div className="section-heading">
            <h3 id="focus-title">{t('디버프를 걸려면 집중은?')}</h3>
            <p>{t('집중이 필요한 쿠키만 확인하세요. 스킬 설명에 적힌 기본 적용률을 선택합니다.')}</p>
          </div>
          <div className="focus-layout">
            <div className="extra-fields">
              <label>
                {t('스킬 기본 디버프 적용률')}
                <select id="debuff" value={form.debuffRate} onChange={(e) => update('debuffRate', e.target.value)}>
                  {DEBUFF_RATE_OPTIONS.map((rate) => (
                    <option key={rate} value={rate}>
                      {formatPercent(rate / 1e4)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  {t('내 쿠키 집중')} <small>{t('부족분 비교용')}</small>
                </span>
                <input
                  id="focus"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder={t('선택 입력')}
                  value={form.focus}
                  onChange={(e) => update('focus', e.target.value)}
                />
              </label>
            </div>
            <div id="stat-output" className="stat-output" aria-live="polite">
              {result ? (
                <StatOutput kind="focus" result={result} debuffRate={form.debuffRate} t={t} locale={locale} />
              ) : (
                placeholder
              )}
            </div>
          </div>
          <p className="field-hint">
            {t(
              '기본 적용률은 캐릭터·승급에 따라 다릅니다. 별도 집중확률·동행 펫과 상태이상 면역은 미포함. 요구치 경계에는 여유를 두세요.',
            )}
          </p>
        </section>
      </form>
    </section>
  )
}
