import type { LocalizedText } from '../../types'
import { ROUTES } from '../../routes'

/**
 * 크럼블 가이드 본문. 게임 규칙과 공식은 사실 정보로 따르고, 설명 문장은 이 프로젝트에서 새로 썼다.
 * 문장 안의 **굵게** 표시는 화면에서 <b>로 바뀐다.
 */

export interface GuideLink {
  to: string
  label: LocalizedText
}

export interface GuideNote {
  id: string
  title: LocalizedText
  /** 왜 그런지: 게임이 계산하는 방식 */
  why: LocalizedText
  /** 그래서 어떻게: 옵션을 고를 때의 기준 */
  rule: LocalizedText
  link?: GuideLink
}

export interface GuideGroup {
  id: 'attack' | 'defense' | 'check'
  eyebrow: LocalizedText
  title: LocalizedText
  notes: GuideNote[]
}

const STAGE_LINK: GuideLink = {
  to: ROUTES.stage,
  label: { ko: '스테이지 계산에서 확인', en: 'Check in the stage calculator', ja: 'ステージ計算で確認' },
}

export const GUIDE_GROUPS: GuideGroup[] = [
  {
    id: 'attack',
    eyebrow: { ko: '공격', en: 'Offense', ja: '攻撃' },
    title: {
      ko: '치명확률 · 속성 · 전투력 · 스킬가속',
      en: 'Crit Rate · Element · Power · Skill Haste',
      ja: '会心率・属性・戦闘力・スキル加速',
    },
    notes: [
      {
        id: 'crit-over-100',
        title: {
          ko: '치명확률은 100%를 넘겨도 피해가 계속 오릅니다',
          en: 'Crit Rate keeps adding damage past 100%',
          ja: '会心率は100%を超えてもダメージが伸び続けます',
        },
        why: {
          ko: '치명 배수는 **1 + 치명확률 × 치명피해**로 정해지고, 이 식의 치명확률에는 상한이 없습니다. 100%를 넘긴 만큼도 배수에 그대로 들어갑니다.',
          en: 'The crit multiplier is **1 + Crit Rate × Crit Damage**, and Crit Rate is not capped in this formula. Anything above 100% still raises the multiplier.',
          ja: '会心倍率は **1 + 会心率 × 会心ダメージ** で決まり、この式の会心率に上限はありません。100%を超えた分もそのまま倍率に入ります。',
        },
        rule: {
          ko: '100%를 멈추는 지점으로 보지 마세요. 치명확률 한 칸을 더했을 때 오르는 피해를 다른 공격 옵션과 나란히 비교해서 고르면 됩니다.',
          en: 'Do not treat 100% as a stopping point. Compare how much one more Crit Rate roll adds against other offensive options.',
          ja: '100%を打ち止めと考えないでください。会心率を一つ足したときの上昇幅を、ほかの攻撃オプションと比べて選びます。',
        },
      },
      {
        id: 'element-exclusive',
        title: {
          ko: '속성피해증가는 상대에 따라 아예 빠질 수 있습니다',
          en: 'Element Damage Up may not apply at all, depending on the target',
          ja: '属性ダメージ増加は相手によって適用されないことがあります',
        },
        why: {
          ko: '상대가 내 속성에 맞는 속성방어를 갖고 있으면 **내 속성피해증가는 무시되고** 상대의 감소 효과만 적용됩니다. 속성방어가 없을 때만 내 증가 효과가 들어가며, 두 효과가 함께 더해지는 경우는 없습니다.',
          en: 'If the target has the matching element defense, **your Element Damage Up is ignored** and only its reduction applies. Your bonus applies only when the target has no matching defense; the two never stack.',
          ja: '相手が自分の属性に対応する属性防御を持っていると、**自分の属性ダメージ増加は無視され**、相手の軽減効果だけが適用されます。属性防御がないときだけ増加効果が入り、両方が合算されることはありません。',
        },
        rule: {
          ko: '수치를 올리기 전에 이 상대에게 적용되는지부터 확인하세요. 적용되지 않는 전투라면 옵션을 더 챙기는 것보다 편성의 속성을 바꾸는 편이 낫습니다.',
          en: 'Check whether the bonus applies to this enemy before investing. If it does not, changing your team’s elements helps more than adding the option.',
          ja: '数値を上げる前に、その相手に適用されるかを確認してください。適用されない戦闘なら、オプションを足すより編成の属性を変えるほうが効果的です。',
        },
      },
      {
        id: 'power-penalty',
        title: {
          ko: '전투력 부족 페널티는 내가 주는 피해에만 걸립니다',
          en: 'The low-Power penalty only affects the damage you deal',
          ja: '戦闘力不足のペナルティは与えるダメージにだけかかります',
        },
        why: {
          ko: '권장 전투력에 못 미치면 내가 **주는 피해**에 배율이 곱해집니다. 내가 **받는 피해**는 이 배율의 영향을 받지 않습니다. 배율은 권장 전투력 대비 비율로 정해지며 아래 표에 정리했습니다.',
          en: 'Below the recommended Power, a multiplier is applied to the damage you **deal**. The damage you **take** is not affected. The multiplier depends on your ratio to the recommended Power, as shown in the table below.',
          ja: '推奨戦闘力に届かないと、**与えるダメージ**に倍率がかかります。**受けるダメージ**には影響しません。倍率は推奨戦闘力に対する比率で決まり、下の表にまとめています。',
        },
        rule: {
          ko: '잘 버티는데 시간 안에 못 잡는다면 생존 옵션보다 다음 전투력 구간을 먼저 노리세요. 구간별로 필요한 전투력은 스테이지 계산에서 바로 볼 수 있습니다.',
          en: 'If you survive but cannot finish in time, aim for the next Power band before adding survival options. The stage calculator shows the Power each band needs.',
          ja: '耐えられるのに時間内に倒せないなら、生存オプションより次の戦闘力区分を先に目指してください。区分ごとの必要戦闘力はステージ計算で確認できます。',
        },
        link: STAGE_LINK,
      },
      {
        id: 'skill-haste',
        title: {
          ko: '스킬가속은 쌓일수록 한 칸의 효과가 줄어듭니다',
          en: 'Each point of Skill Haste is worth less as it stacks',
          ja: 'スキル加速は積むほど一つあたりの効果が小さくなります',
        },
        why: {
          ko: '쿨타임은 스킬가속을 **분모에 넣어** 줄어드는 방식입니다. 이미 가속이 높으면 같은 수치를 더해도 단축되는 시간이 점점 작아집니다.',
          en: 'Cooldown is reduced with Skill Haste **in the denominator**, so the more you already have, the less time the same amount saves.',
          ja: 'クールタイムはスキル加速を**分母に入れて**短縮されます。すでに加速が高いと、同じ数値を足しても短縮される時間は小さくなります。',
        },
        rule: {
          ko: '같은 수치라면 가속이 낮은 쿠키에 줄 때 효과가 큽니다. 가속이 이미 높은 쿠키는 다른 옵션의 상승폭과 비교해 보세요.',
          en: 'The same amount helps most on a Cookie with low Skill Haste. For Cookies that already have a lot, compare it with other options.',
          ja: '同じ数値なら、加速が低いクッキーに付けたほうが効果は大きくなります。すでに加速が高いクッキーは、ほかのオプションと比べてください。',
        },
      },
      {
        id: 'pet-layer',
        title: {
          ko: '동행 펫 효과는 능력치 화면과 따로 적용됩니다',
          en: 'Companion pet effects are applied separately from the stat screen',
          ja: '同行ペットの効果はステータス画面とは別に適用されます',
        },
        why: {
          ko: '동행 효과는 능력치 화면에 잡히지 않는 **전투 중 버프**입니다. 같은 능력치의 비율 효과는 펫끼리 먼저 더한 뒤 화면 수치에 곱하고, 스킬증폭처럼 더하는 효과는 화면 수치에 그대로 더합니다.',
          en: 'Companion effects are **in-battle buffs** that the stat screen does not show. Percentage effects on the same stat are summed across pets first and then multiply the on-screen value; additive effects such as Skill Amplify are simply added.',
          ja: '同行効果はステータス画面に表示されない**戦闘中のバフ**です。同じステータスの割合効果はペット同士で先に合算してから画面の数値に掛け、スキル増幅のような加算効果は画面の数値にそのまま足します。',
        },
        rule: {
          ko: '펫의 공격력 %는 완성된 화면 공격력에 한 번 더 곱해지므로, 장비·슈가룬에서 얻는 공격력 %와 단순히 더해서 비교하면 안 됩니다.',
          en: 'A pet’s ATK % multiplies the finished on-screen ATK, so do not simply add it to ATK % from gear or Sugar Runes when comparing.',
          ja: 'ペットの攻撃力%は完成した画面の攻撃力にもう一度掛かるため、装備やシュガールーンの攻撃力%と単純に足して比べないでください。',
        },
      },
      {
        id: 'stat-layers',
        title: {
          ko: '공격력 %는 어디서 얻었는지에 따라 계산 단계가 다릅니다',
          en: 'ATK % is calculated in different layers depending on its source',
          ja: '攻撃力%は入手先によって計算の段階が異なります',
        },
        why: {
          ko: '같은 단계에서 얻은 공격력 %는 먼저 모두 더하고, 슈가룬·연구·전투 버프처럼 단계가 다른 효과는 차례로 곱합니다. 스킬증폭은 출처와 상관없이 전부 더한 뒤 최종 스킬 효과에 한 번만 적용됩니다.',
          en: 'ATK % from the same layer is summed first, while layers such as Sugar Runes, research and battle buffs multiply one after another. Skill Amplify is summed from every source and applied once to the final skill effect.',
          ja: '同じ段階で得た攻撃力%は先にすべて合算し、シュガールーン・研究・戦闘バフのように段階が異なる効果は順に掛け合わせます。スキル増幅は入手先に関係なくすべて合算し、最終的なスキル効果に一度だけ適用されます。',
        },
        rule: {
          ko: '이미 많이 쌓인 단계에 같은 %를 더하면 실제 상승폭은 작아집니다. 아직 덜 채운 단계의 옵션이 더 크게 오를 수 있으니 실제 상승률로 비교하세요.',
          en: 'Adding the same % to a layer that is already high gives a smaller real gain. Options in a less-filled layer may gain more, so compare actual increases.',
          ja: 'すでに多く積んだ段階に同じ%を足しても、実際の上昇幅は小さくなります。まだ少ない段階のオプションのほうが伸びることがあるので、実際の上昇率で比べてください。',
        },
      },
    ],
  },
  {
    id: 'defense',
    eyebrow: { ko: '방어', en: 'Defense', ja: '防御' },
    title: {
      ko: '치명저항 · 피해감소 · 방어력 · 저항',
      en: 'Crit Resist · Damage Reduction · DEF · Resistance',
      ja: '会心抵抗・被ダメージ減少・防御力・抵抗',
    },
    notes: [
      {
        id: 'crit-resist-cap',
        title: {
          ko: 'PvE에서 치명저항은 10%면 충분합니다',
          en: 'In PvE, 10% Crit Resist is enough',
          ja: 'PvEでは会心抵抗は10%で十分です',
        },
        why: {
          ko: '대부분의 몬스터는 치명확률이 10%입니다. 치명저항이 10%가 되면 몬스터의 치명타가 아예 나오지 않고, 그 이상은 아무 효과가 없습니다. 0%에서 10%까지 채웠을 때 얻는 생존력도 **약 5%** 수준입니다.',
          en: 'Most monsters have 10% Crit Rate. At 10% Crit Resist they cannot crit at all, and anything above that does nothing. Going from 0% to 10% only adds **about 5%** survivability.',
          ja: 'ほとんどのモンスターは会心率が10%です。会心抵抗が10%になるとモンスターの会心は発生せず、それ以上は効果がありません。0%から10%まで確保しても生存力は**約5%**しか上がりません。',
        },
        rule: {
          ko: 'PvE에서는 후순위 옵션입니다. 꼭 필요하면 10%까지만 맞추고, 남는 자리는 피해감소처럼 효과가 계속 오르는 옵션에 쓰세요.',
          en: 'Treat it as a low priority in PvE. If you need it, stop at 10% and spend the rest on options like Damage Reduction that keep paying off.',
          ja: 'PvEでは優先度の低いオプションです。必要なら10%までにとどめ、残りは被ダメージ減少のように効果が伸び続けるオプションに回してください。',
        },
      },
      {
        id: 'damage-reduction',
        title: {
          ko: '피해감소는 쌓아도 효율이 떨어지지 않습니다',
          en: 'Damage Reduction does not lose value as it stacks',
          ja: '被ダメージ減少は積んでも効率が落ちません',
        },
        why: {
          ko: '버틸 수 있는 피해량은 **1 ÷ (1 − 피해감소)**에 비례합니다. 체력·방어력·치명저항은 높아질수록 같은 수치의 효과가 줄지만, 피해감소는 오히려 한 칸의 가치가 유지되거나 커집니다.',
          en: 'Effective survivability scales with **1 ÷ (1 − Damage Reduction)**. HP, DEF and Crit Resist give less per point as they grow, but each point of Damage Reduction keeps or even gains value.',
          ja: '耐えられるダメージ量は **1 ÷ (1 − 被ダメージ減少)** に比例します。体力・防御力・会心抵抗は高くなるほど同じ数値の効果が減りますが、被ダメージ減少は一つあたりの価値が保たれるか、むしろ大きくなります。',
        },
        rule: {
          ko: '방어 부옵션에서 가장 먼저 비교할 항목입니다. 따로 정해진 상한이 없으니 이미 높다는 이유만으로 후보에서 빼지 마세요.',
          en: 'It is the first thing to compare among defensive substats. There is no fixed cap, so do not drop it just because it is already high.',
          ja: '防御サブオプションで最初に比べる項目です。決まった上限はないので、すでに高いという理由だけで候補から外さないでください。',
        },
      },
      {
        id: 'defense-hp',
        title: {
          ko: '방어력이 충분히 높으면 체력과 효율이 비슷해집니다',
          en: 'With high DEF, DEF and HP become roughly equal in value',
          ja: '防御力が十分に高いと、体力との効率がほぼ同じになります',
        },
        why: {
          ko: '버틸 수 있는 피해량은 **체력 × (1 + 방어력 ÷ 500)**으로 계산됩니다. 방어력이 500보다 훨씬 크면 1이 차지하는 몫이 작아져서, 방어력과 체력을 같은 비율로 올렸을 때 생존력도 거의 같은 비율로 오릅니다.',
          en: 'Effective survivability is **HP × (1 + DEF ÷ 500)**. Once DEF is far above 500, the “1” barely matters, so raising DEF or HP by the same percentage gives almost the same gain.',
          ja: '耐えられるダメージ量は **体力 × (1 + 防御力 ÷ 500)** で計算されます。防御力が500より十分大きいと1の比重が小さくなり、防御力と体力を同じ割合で上げたときの生存力の伸びもほぼ同じになります。',
        },
        rule: {
          ko: '충분히 성장한 쿠키라면 둘 중 하나를 고정으로 우선하지 마세요. 그 부위에서 얻을 수 있는 수치로 실제 생존력 상승을 비교하면 됩니다.',
          en: 'For well-grown Cookies, do not always favor one over the other. Compare the real survivability gain from the values that slot can roll.',
          ja: '十分に育ったクッキーなら、どちらかを固定で優先しないでください。その部位で得られる数値で実際の生存力の伸びを比べます。',
        },
      },
      {
        id: 'heal-vs-hp',
        title: {
          ko: '회복이 있는 편성이라면 체력보다 피해감소가 낫습니다',
          en: 'With healing in the team, Damage Reduction beats HP',
          ja: '回復がある編成なら、体力より被ダメージ減少が有利です',
        },
        why: {
          ko: '회복량은 공격력과 스킬증폭으로 정해지고 **최대 체력과는 상관이 없습니다.** 체력을 올려도 한 번에 채워지는 양은 그대로지만, 피해감소는 회복으로 메워야 할 양 자체를 줄여 줍니다.',
          en: 'Healing scales with ATK and Skill Amplify and is **unrelated to max HP.** More HP does not make each heal bigger, while Damage Reduction shrinks the amount healing has to cover.',
          ja: '回復量は攻撃力とスキル増幅で決まり、**最大体力とは関係ありません。** 体力を上げても一度に回復する量は変わりませんが、被ダメージ減少は回復で埋めるべき量そのものを減らします。',
        },
        rule: {
          ko: '힐러가 있는 편성에서는 피해감소를 우선하세요. 회복이 전혀 없는 편성이라면 체력도 충분히 경쟁력이 있습니다.',
          en: 'Prioritize Damage Reduction in teams with a healer. In teams with no healing at all, HP is still competitive.',
          ja: 'ヒーラーがいる編成では被ダメージ減少を優先してください。回復がまったくない編成なら、体力も十分に競争力があります。',
        },
      },
      {
        id: 'pve-resist',
        title: {
          ko: 'PvE에서 저항은 올려도 얻는 것이 적습니다',
          en: 'Resistance gives little in PvE',
          ja: 'PvEでは抵抗を上げても得るものは少ないです',
        },
        why: {
          ko: '몬스터의 집중은 스테이지와 관계없이 고정되어 있어서, 내 저항을 올려도 내가 받는 상태이상 확률이 크게 줄지 않습니다.',
          en: 'Monster Focus is fixed across all stages, so raising your Resistance barely lowers the chance of status effects landing on you.',
          ja: 'モンスターの集中はステージに関係なく固定なので、自分の抵抗を上げても受ける状態異常の確率はあまり下がりません。',
        },
        rule: {
          ko: 'PvE 장비 부옵션에서는 저항을 뒤로 미루세요. 저항은 내가 **받는** 상태이상에, 집중은 내가 **거는** 상태이상에 관여하니 둘을 헷갈리지 않도록 주의하세요.',
          en: 'Put Resistance last for PvE gear substats. Resistance affects status effects you **receive**, while Focus affects the ones you **apply**; do not mix them up.',
          ja: 'PvEの装備サブオプションでは抵抗を後回しにしてください。抵抗は自分が**受ける**状態異常、集中は自分が**かける**状態異常に関わるので、混同しないようにしましょう。',
        },
      },
    ],
  },
  {
    id: 'check',
    eyebrow: { ko: '판정', en: 'Checks', ja: '判定' },
    title: { ko: '명중 · 집중', en: 'Accuracy · Focus', ja: '命中・集中' },
    notes: [
      {
        id: 'hit-cap',
        title: {
          ko: '명중은 적중률 100%를 넘기면 쓸모가 없습니다',
          en: 'Accuracy is wasted past 100% hit rate',
          ja: '命中は命中率100%を超えると意味がありません',
        },
        why: {
          ko: '적중률은 **내 명중 ÷ 상대 회피**로 계산되고 100%에서 멈춥니다. 100%에 도달한 뒤 더한 명중은 효과가 **정확히 0**입니다.',
          en: 'Hit rate is **your Accuracy ÷ enemy Evasion**, capped at 100%. Accuracy beyond that point adds **exactly nothing**.',
          ja: '命中率は **自分の命中 ÷ 相手の回避** で計算され、100%で頭打ちです。100%に達したあとの命中の効果は**ちょうど0**です。',
        },
        rule: {
          ko: '목표 스테이지의 회피만큼만 명중을 맞추고, 남는 자리는 피해를 실제로 올리는 공격 옵션에 쓰세요. 스테이지별로 필요한 명중은 스테이지 계산에 나옵니다.',
          en: 'Get just enough Accuracy for your target stage’s Evasion and spend the rest on options that actually raise damage. The stage calculator shows the Accuracy each stage needs.',
          ja: '目標ステージの回避の分だけ命中を確保し、残りは実際にダメージを上げる攻撃オプションに回してください。ステージごとの必要命中はステージ計算に表示されます。',
        },
        link: STAGE_LINK,
      },
      {
        id: 'focus-cap',
        title: {
          ko: '집중은 디버프 적용률 100%를 넘기면 쓸모가 없습니다',
          en: 'Focus is wasted past a 100% debuff rate',
          ja: '集中はデバフ適用率100%を超えると意味がありません',
        },
        why: {
          ko: '상태이상이 걸리는지는 **상태이상을 거는 쿠키의 집중**으로 판정합니다. 적용률은 스킬의 기본 적용률과 상대 저항으로 정해지고 100%가 상한이라, 그 이상의 집중은 효과가 **정확히 0**입니다.',
          en: 'Whether a status effect lands is decided by **the Focus of the Cookie applying it**. The rate depends on the skill’s base rate and the enemy’s Resistance and caps at 100%, so extra Focus adds **exactly nothing**.',
          ja: '状態異常がかかるかどうかは、**状態異常をかけるクッキーの集中**で判定します。適用率はスキルの基本適用率と相手の抵抗で決まり、100%が上限なので、それ以上の集中の効果は**ちょうど0**です。',
        },
        rule: {
          ko: '디버프를 쓰는 쿠키만 목표 스테이지에 필요한 만큼 집중을 맞추세요. 마법물체·책·음식 부옵션에는 공격 계열 옵션이 나오지 않으니 그 부위에서 집중을 챙기고, 디버프가 없는 쿠키라면 생존 옵션을 고르세요.',
          en: 'Only Cookies that apply debuffs need Focus, and only as much as the target stage requires. Magic items, books and food cannot roll offensive substats, so take Focus there; Cookies without debuffs should pick survival options instead.',
          ja: 'デバフを使うクッキーだけ、目標ステージに必要な分の集中を確保してください。魔法物体・本・食べ物のサブオプションには攻撃系が出ないので、その部位で集中を確保し、デバフのないクッキーなら生存オプションを選びます。',
        },
        link: STAGE_LINK,
      },
    ],
  },
]
