import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DIMENSION_SEASON, dimensionQuery } from '../../api/queries'
import { pick, useI18n } from '../../i18n'
import { DAMAGE_BANDS, powerPenalty } from '../../lib/formulas'
import { formatDimensionMillions, formatNumber } from '../../lib/format'
import { readStorage, writeStorage } from '../../lib/storage'
import { readTeamPower, writeTeamPower } from '../../lib/teamPower'

interface DimensionForm {
  stage: string
  /** M 단위 */
  power: string
  level: string
}

const STORAGE_KEY = `crumble.dimension.season-${DIMENSION_SEASON}`
const EMPTY: DimensionForm = { stage: '1', power: '', level: '1' }
const EXAMPLE: DimensionForm = { stage: '10', power: '30000', level: '10' }
const QUICK_STAGES = [1, 10, 25, 50, 100] as const

/** 목표 단계·레벨은 시즌별로 저장하고, 팀 전투력은 일반 스테이지와 같이 쓰는 값을 우선한다. */
function loadForm(): DimensionForm {
  let form = EMPTY
  try {
    const saved = JSON.parse(readStorage(STORAGE_KEY) ?? 'null') as Partial<DimensionForm> | null
    if (saved && (['stage', 'power', 'level'] as const).every((key) => typeof saved[key] === 'string')) {
      form = { stage: saved.stage!, power: saved.power!, level: saved.level! }
    }
  } catch {
    // 저장값이 깨져 있으면 기본값으로 시작한다.
  }
  const sharedPower = readTeamPower()
  return sharedPower === null ? form : { ...form, power: sharedPower }
}

const percent = (value: number) => Math.round(100 * value)

/** 권장 전투력 대비 내 전투력으로 피해 구간을 보여 준다. */
function PenaltyPanel({ required, power }: { required: number; power: number | null }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const millions = (value: number) => formatDimensionMillions(value, locale)
  const penalty = power === null ? null : powerPenalty(power, required)
  const ratio = penalty ? (100 * penalty.ratio).toFixed(2) : ''

  return (
    <section className="panel dimension-penalty" aria-label={l('전투력 피해 구간', 'Power damage bands', '戦闘力ダメージ区分')}>
      <h3>{l('내 피해 구간과 다음 목표', 'My damage band and next target', 'ダメージ区分と次の目標')}</h3>
      <div className="dimension-penalty-summary" aria-live="polite">
        <div>
          <span>{l('현재 피해 구간', 'Current damage band', '現在のダメージ区分')}</span>
          <strong>{penalty ? `${percent(penalty.multiplier)}%` : '—'}</strong>
          <p>
            {penalty
              ? l(`권장 투력 대비 ${ratio}%`, `${ratio}% of recommended Power`, `推奨戦闘力の${ratio}%`)
              : l('내 전투력을 입력하세요.', 'Enter your Power.', '戦闘力を入力してください。')}
          </p>
        </div>
        <div>
          <span>{l('다음 피해 구간', 'Next damage band', '次のダメージ区分')}</span>
          <strong>
            {penalty
              ? penalty.nextThreshold === null
                ? l('최고 구간', 'Top band', '最高区分')
                : `${percent(penalty.nextMultiplier)}%`
              : '—'}
          </strong>
          {penalty && penalty.nextThreshold !== null && (
            <p>
              {l('필요 투력', 'Target Power', '必要戦闘力')} {millions(penalty.nextTarget)}M
              <br />
              {l('추가 필요', 'Additional Power', '不足戦闘力')} <b>{millions(penalty.needed)}M</b>
            </p>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="band-table">
          <caption>{l('목표 단계의 구간별 전투력 기준', 'Power thresholds for the target stage', '目標ステージの戦闘力基準')}</caption>
          <thead>
            <tr>
              <th scope="col">{l('피해 배율', 'Damage', 'ダメージ')}</th>
              <th scope="col">{l('권장 투력 대비', 'Power ratio', '推奨値との比率')}</th>
              <th scope="col">{l('진입 전투력', 'Entry Power', '必要戦闘力')}</th>
            </tr>
          </thead>
          <tbody>
            {DAMAGE_BANDS.map((band) => {
              const isCurrent = penalty?.multiplier === band.multiplier
              return (
                <tr key={band.min} className={isCurrent ? 'is-current' : undefined} aria-current={isCurrent ? 'true' : undefined}>
                  <th scope="row">
                    {percent(band.multiplier)}% {isCurrent && <small>{l('현재', 'Current', '現在')}</small>}
                  </th>
                  <td>
                    {band.max === null
                      ? `${percent(band.min)}% ${l('이상', 'or more', '以上')}`
                      : `${percent(band.min)}% ~ ${percent(band.max)}% ${l('미만', 'exclusive', '未満')}`}
                  </td>
                  <td>{millions(Math.ceil(required * band.min))}M</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          '일반전·보스전에 동일하게 적용되는 전투력 보정입니다. 피해 배율은 피해 감소율이나 클리어 확률이 아닙니다. 게임의 축약 투력 표시는 반올림될 수 있으므로 경계에서는 실제 수치와 차이가 날 수 있습니다.',
          'The same Power modifier applies to normal and boss waves. This is a damage multiplier, not damage reduction or clear probability. Rounded in-game Power may differ near a boundary.',
          '通常戦・ボス戦に共通の戦闘力補正です。軽減率やクリア確率ではありません。ゲーム内の省略表示は丸められるため、境界付近では実際の値と差が生じる場合があります。',
        )}
      </p>
    </section>
  )
}

export function DimensionStage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [form, setForm] = useState<DimensionForm>(loadForm)
  const [exampleMode, setExampleMode] = useState(false)
  const { data, isError } = useQuery(dimensionQuery)

  useEffect(() => {
    // 예시 값은 저장하지 않는다.
    if (exampleMode) return
    writeStorage(STORAGE_KEY, JSON.stringify({ ...form, unit: 'M' }))
    writeTeamPower(form.power)
  }, [form, exampleMode])

  const update = (key: keyof DimensionForm, value: string) => {
    setExampleMode(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const num = (value: number) => formatNumber(value, locale)
  const stageNo = Number(form.stage)
  const levelNo = Number(form.level)
  const power = Number(form.power)
  const stageValid = Number.isInteger(stageNo) && stageNo >= 1 && stageNo <= 100
  const stage = stageValid ? data?.stages[stageNo - 1] : undefined
  const energy = Number.isInteger(levelNo) && levelNo >= 1 && levelNo <= 100 ? data?.energy[levelNo - 1] : undefined
  const nextEnergy = energy ? data?.energy[levelNo] : undefined
  const reward = stage ? data?.rewards.find((r) => r.stages.includes(stageNo)) : undefined
  const hasPower = form.power !== '' && Number.isFinite(1e6 * power) && power > 0
  const recommended = stage ? Number(stage.cp) / 1e6 : 0

  return (
    <section className="dimension-ui" aria-label={l('차원의 이면', 'Dimension', '次元の裏側')}>
      <div className="section-intro">
        <div>
          <h2>{l('차원의 이면 스테이지 계산', 'Dimension stage calculator', '次元のステージ計算')}</h2>
          <p>
            {l(
              '목표 단계와 현재 팀 전투력으로 피해 구간과 다음 목표를 확인하세요.',
              'Check damage bands and your next target with your stage and team Power.',
              '目標ステージとチーム戦闘力でダメージ区分と次の目標を確認。',
            )}
          </p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setExampleMode(true)
            setForm(EXAMPLE)
          }}
        >
          {l('예시 넣기', 'Try example', '入力例')}
        </button>
      </div>

      <section className="panel dimension-input-panel">
        <div className="dimension-input-grid">
          <div>
            <h3>{l('목표 단계', 'Target stage', '目標ステージ')}</h3>
            <div className="stage-controls">
              <button
                type="button"
                className="step-button"
                disabled={!stageValid || stageNo === 1}
                aria-label={l('이전 단계', 'Previous stage', '前のステージ')}
                onClick={() => update('stage', String(stageNo - 1))}
              >
                −
              </button>
              <label className="stage-number">
                <span className="sr-only">{l('차원의 이면 단계', 'Dimension stage', '次元のステージ')}</span>
                <input
                  id="dimension-stage"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={form.stage}
                  onChange={(e) => update('stage', e.target.value)}
                />
              </label>
              <button
                type="button"
                className="step-button"
                disabled={!stageValid || stageNo === 100}
                aria-label={l('다음 단계', 'Next stage', '次のステージ')}
                onClick={() => update('stage', String(stageNo + 1))}
              >
                +
              </button>
            </div>
            <input
              className="stage-slider"
              type="range"
              min="1"
              max="100"
              value={stageValid ? stageNo : 1}
              aria-label={l('목표 단계 슬라이더', 'Target stage slider', '目標ステージスライダー')}
              onChange={(e) => update('stage', e.target.value)}
            />
            <div className="range-labels">
              <span>1</span>
              <span>100</span>
            </div>
            <div className="quick-stages">
              {QUICK_STAGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={stageValid && stageNo === value}
                  onClick={() => update('stage', String(value))}
                >
                  {value}
                </button>
              ))}
            </div>
            {!stageValid && (
              <p role="alert" className="error">
                {l('1~100 사이의 정수를 입력하세요.', 'Enter an integer from 1 to 100.', '1〜100の整数を入力してください。')}
              </p>
            )}
          </div>

          <div>
            <div className="section-head">
              <h3>
                <label htmlFor="dimension-power">{l('현재 팀 전투력', 'Team Power', 'チーム戦闘力')}</label>
              </h3>
              <span className="subtle">{l('선택 입력', 'Optional', '任意')}</span>
            </div>
            <div className="unit-field">
              <input
                id="dimension-power"
                type="number"
                min="0"
                step="any"
                placeholder="30000"
                value={form.power}
                onChange={(e) => update('power', e.target.value)}
              />
              <span>M</span>
            </div>
            <p className="field-note">
              {l(
                '차원의 이면 팀 전투력 · 1억 = 100M. 차원의 힘 보정은 다시 더하지 않습니다.',
                'Dimension team Power · 1M = 1,000,000. Energy bonuses are not added again.',
                '次元内のチーム戦闘力 · 1億 = 100M。次元の力の補正は再加算しません。',
              )}
            </p>
            <div className="form-actions">
              {exampleMode && <span className="example-tag">{l('예시 값', 'Example values', '入力例')}</span>}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setExampleMode(false)
                  setForm(EMPTY)
                }}
              >
                {l('초기화', 'Reset', 'リセット')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="dimension-results">
        {stage && <PenaltyPanel required={Number(stage.cp)} power={hasPower ? 1e6 * power : null} />}
        <section className="panel dimension-stage-info" aria-live="polite">
          {stage ? (
            <>
              <div className="section-head">
                <span className="eyebrow">
                  {l('차원의 이면', 'Dimension', '次元の裏側')} · {stageNo}
                </span>
                <span className="live-badge">{l(`시즌 ${DIMENSION_SEASON}`, `Season ${DIMENSION_SEASON}`, `シーズン${DIMENSION_SEASON}`)}</span>
              </div>
              <p className="subtle">{l('목표 단계 권장 전투력', 'Recommended Power', '目標ステージの推奨戦闘力')}</p>
              <div className="big-value">
                <strong>{num(recommended)}</strong>
                <span>M</span>
              </div>
              <div className="comparison">
                {hasPower ? (
                  <>
                    {power < recommended
                      ? l('권장값까지 부족한 전투력', 'Power below recommendation', '推奨値までの不足戦闘力')
                      : l('권장값보다 높은 전투력', 'Power above recommendation', '推奨値を超える戦闘力')}{' '}
                    <strong className={power < recommended ? 'warning' : 'good'}>{num(Math.abs(recommended - power))}M</strong>
                  </>
                ) : form.power !== '' ? (
                  l('전투력은 0보다 큰 숫자로 입력하세요.', 'Enter Power greater than zero.', '0より大きい戦闘力を入力してください。')
                ) : (
                  l(
                    '내 전투력을 입력하면 권장값과 비교할 수 있어요.',
                    'Enter Power to compare with the recommendation.',
                    '戦闘力を入力すると推奨値と比較できます。',
                  )
                )}
              </div>
              <div className="power-track">
                <i style={{ width: hasPower ? `${Math.min(100, (power / recommended) * 100)}%` : '0%' }} />
              </div>
              <div className="enemy-stats">
                <div>
                  <span>{l('적 회피', 'Enemy evasion', '敵の回避')}</span>
                  <strong>{num(stage.avoidance)}</strong>
                </div>
                <div>
                  <span>{l('적 저항', 'Enemy resistance', '敵の抵抗')}</span>
                  <strong>{num(stage.resist)}</strong>
                </div>
                <div>
                  <span>{l('전투 제한', 'Time limit', '制限時間')}</span>
                  <strong>30s</strong>
                </div>
              </div>
              <div className="enemy-line">
                <span className="enemy-symbol" aria-hidden="true">
                  ⚔
                </span>
                <div>
                  <span className="subtle">{l('전투 상대', 'Enemies', '戦闘相手')}</span>
                  <p>{stage.enemies.map((enemy) => `${enemy.names[locale] ?? enemy.name} × ${enemy.amount}`).join(' / ')}</p>
                </div>
              </div>
              <p className="field-note">
                {l(
                  '전투력 피해 구간을 함께 확인하세요. 클리어 여부는 스탯과 조합에 따라 달라집니다.',
                  'See the damage band result. Clearing also depends on stats and team composition.',
                  'ダメージ区分もご確認ください。クリア可否はステータスや編成にも左右されます。',
                )}
              </p>
            </>
          ) : (
            <p role={isError ? 'alert' : undefined} className="result-placeholder">
              {stageValid
                ? isError
                  ? l('데이터를 불러오지 못했습니다. 새로고침해 주세요.', 'Unable to load data. Please reload.', 'データを読み込めません。再読み込みしてください。')
                  : l('불러오는 중…', 'Loading…', '読み込み中…')
                : l('목표 단계를 수정해 주세요.', 'Correct the target stage.', '目標ステージを修正してください。')}
            </p>
          )}
        </section>
      </div>

      <section className="panel energy-panel">
        <div className="energy-heading">
          <div>
            <h3>{l('차원의 힘', 'Dimensional energy', '次元の力')}</h3>
            <p className="subtle">
              {l('이번 시즌, 차원의 이면에서만 적용되는 성장', 'Seasonal growth exclusive to Dimension', '今シーズンの次元内でのみ適用される成長')}
            </p>
          </div>
          <label className="level-field">
            {l('내 레벨', 'My level', '自分のレベル')}
            <input
              id="dimension-level"
              type="number"
              min="1"
              max="100"
              step="1"
              value={form.level}
              onChange={(e) => update('level', e.target.value)}
            />
          </label>
        </div>
        <div className="energy-values">
          <div>
            <span>{l('이 레벨까지 필요한 누적 차원의 힘', 'Total energy required for this level', 'このレベルまでの累計必要量')}</span>
            <strong>{energy ? num(energy.total) : '—'}</strong>
          </div>
          <div>
            <span>{l('다음 레벨까지 누적 기준 차이', 'Energy between level thresholds', '次のレベルまでの累計必要量の差')}</span>
            <strong>
              {energy ? (nextEnergy ? num(nextEnergy.total - energy.total) : l('최고 레벨', 'Max level', '最高レベル')) : '—'}
            </strong>
          </div>
          <div>
            <span>{l('선택한 단계의 자동 사냥 보상', 'Idle reward at selected stage', '選択ステージの放置報酬')}</span>
            <strong>{reward ? `${num(reward.perMinute)} / min` : '—'}</strong>
          </div>
        </div>
        <p className="field-note">
          {l(
            '성장 정보를 조회하는 영역입니다. 입력한 전투력을 변경하지 않으며, 다음 레벨 수치는 현재 보유량을 뺀 개인 잔여량이 아닙니다.',
            'For reference only. This does not modify your Power. The level difference does not subtract your current energy.',
            '成長情報の参照用です。戦闘力は変更しません。必要量の差は現在の所持量を差し引いた残量ではありません。',
          )}
        </p>
        {!energy && data && (
          <p role="alert" className="error">
            {l('레벨은 1~100 사이의 정수로 입력하세요.', 'Enter a level from 1 to 100.', 'レベルは1〜100の整数を入力してください。')}
          </p>
        )}
      </section>

      <details className="panel details">
        <summary>{l('차원의 이면, 무엇이 다른가요?', 'About Dimension', '次元について')}</summary>
        <p>
          {l(
            '최고 클리어 단계로 순위가 결정되고, 같은 단계라면 먼저 달성한 이용자가 앞섭니다.',
            'Players are ranked by their highest cleared stage; ties favor whoever reached that stage first.',
            '最高クリア段階で順位が決まり、同じ段階なら早く達成したプレイヤーが上位になります。',
          )}
        </p>
        <p>
          {l(
            '차원의 힘은 전용 성장 경험치, 차원의 조각은 교환소 재화입니다. 시즌 종료 시 차원의 힘과 진행도가 초기화됩니다.',
            'Energy is for growth; shards are exchange currency. Energy and stage progress reset at season end.',
            '次元の力は成長用経験値、欠片は交換用通貨です。シーズン終了時に次元の力と進行度がリセットされます。',
          )}
        </p>
      </details>
    </section>
  )
}
