/* 安心 · 本地可疑话术初筛引擎
 * 纯规则、无网络请求。它是“提醒器”，不是判决书。 */
(function () {
  'use strict';

  var CATEGORY_LABELS = {
    authority: '对方在冒充谁',
    money: '在打你钱的主意',
    pressure: '在吓你、让你保密',
    lure: '用好处引你上钩',
    link: '链接和技术风险',
    social: '熟人、感情与联系渠道'
  };

  var CATEGORY_CAPS = {
    authority: 45,
    money: 65,
    pressure: 42,
    lure: 45,
    link: 45,
    social: 32
  };

  var RULES = [
    {
      id: 'persona_police',
      category: 'authority',
      weight: 22,
      label: '自称公安、法院、检察院',
      explanation: '真正的公检法不会用电话办案，更不会让你转账。',
      patterns: [/(公安|警察|派出所|检察院|法院|警官|民警|刑侦|经侦|网警|反诈中心)/]
    },
    {
      id: 'case_involved',
      category: 'authority',
      weight: 18,
      label: '说你“涉案”、要“清查资金”',
      explanation: '先把你吓住，是骗子的第一步。',
      patterns: [/(涉案|洗钱|犯罪|通缉|逮捕|拘留|传唤|立案|资金清查|非法集资)/]
    },
    {
      id: 'safe_account',
      category: 'money',
      weight: 35,
      critical: true,
      label: '让你转进“安全账户”',
      explanation: '世界上没有“安全账户”，这是最典型的诈骗话术。',
      patterns: [/(安全账户|资金公证|监管账户|清查账户|验资账户|安全卡)/]
    },
    {
      id: 'persona_service',
      category: 'authority',
      weight: 14,
      label: '自称客服，要帮你退款或关服务',
      explanation: '退款、关闭扣费，都不需要你转账或共享屏幕。',
      patterns: [/(客服|售后|理赔|退款|订单异常|快递丢失|包裹丢失|百万保障|关闭会员|注销会员|解绑|保险到期|自动扣费|扣费)/]
    },
    {
      id: 'persona_acquaintance',
      category: 'social',
      weight: 14,
      label: '冒充领导、熟人',
      explanation: '熟人借钱，务必用原来的号码回拨确认。',
      patterns: [/(领导|老板|校长|主任|书记|换号|新号码|新号|猜猜我是谁|老朋友|老同学|同事)/]
    },
    {
      id: 'gov_benefit',
      category: 'authority',
      weight: 12,
      label: '拿社保、补贴说事',
      explanation: '补贴不会让你先交钱，也不会让你点陌生链接。',
      patterns: [/(社保|医保|养老金|补贴|公积金|退税|税务)/]
    },
    {
      id: 'transfer',
      category: 'money',
      weight: 15,
      label: '提到转账、汇款',
      explanation: '只要对方让你转钱，就先停下来。',
      patterns: [/(转账|汇款|打款|打钱|转给|转到|转入|存入|缴纳|保证金|解冻金|手续费|垫付|充值|转[0-9一二三四五六七八九十两]+(万|千|百|元|块))/]
    },
    {
      id: 'verification_code',
      category: 'money',
      weight: 40,
      critical: true,
      label: '要验证码、密码',
      explanation: '验证码就是钱。任何人、任何理由，都不能给。',
      patterns: [/(发|给|告诉|报|提供|索要|要|输入).{0,6}(验证码|校验码|动态码|短信码|支付密码|交易密码)|(验证码|校验码|动态码|短信码|支付密码|交易密码).{0,6}(发|给|告诉|报|提供|是多少)/]
    },
    {
      id: 'screen_share',
      category: 'money',
      weight: 40,
      critical: true,
      label: '让你共享屏幕或装软件',
      explanation: '屏幕共享会让对方看到你的验证码和银行密码。',
      patterns: [/(屏幕共享|共享屏幕|远程控制|远程协助|下载.{0,6}(会议|软件|app|应用|助手)|安装.{0,6}(会议|软件|app|应用)|腾讯会议|zoom|钉钉会议|瞩目)/]
    },
    {
      id: 'personal_info',
      category: 'money',
      weight: 15,
      label: '要你的卡号、身份证',
      explanation: '正规机构不会在电话、聊天里索要这些信息。',
      patterns: [/(银行卡号|卡号|身份证号|身份证|人脸识别|刷脸|网银|u盾|正反面照片|身份证照片)/]
    },
    {
      id: 'loan_credit',
      category: 'money',
      weight: 12,
      label: '拿贷款、征信说事',
      explanation: '“注销校园贷”“修复征信”都是骗局。',
      patterns: [/(贷款|征信|额度|网贷|校园贷|微粒贷|白条|花呗|借呗)/]
    },
    {
      id: 'invest',
      category: 'lure',
      weight: 20,
      label: '拉你投资、荐股',
      explanation: '陌生人带你赚钱，赚的是你的本金。',
      patterns: [/(虚拟币|usdt|比特币|交易所|投资平台|内幕消息|荐股|带单|股票群|理财老师|投资老师|内部渠道|打新)/]
    },
    {
      id: 'guaranteed_profit',
      category: 'lure',
      weight: 25,
      label: '承诺“稳赚不赔”',
      explanation: '投资有风险，承诺稳赚的只有骗子。',
      patterns: [/(稳赚|保本|保收益|高回报|零风险|包赚|只涨不跌|内部消息)/]
    },
    {
      id: 'secrecy',
      category: 'pressure',
      weight: 30,
      label: '让你保密、别挂电话',
      explanation: '让你不和家人商量的，基本都是骗子。',
      patterns: [/(不要告诉|别告诉|不能告诉|不要跟家人|别跟家人|别跟家里|不要跟别人说|不能挂|不要挂|别挂|单独联系|保密)/]
    },
    {
      id: 'intimidation',
      category: 'pressure',
      weight: 16,
      label: '吓唬你',
      explanation: '越是吓你，越要先挂断、再核实。',
      patterns: [/(坐牢|判刑|影响子女|影响征信|冻结|追究|违法|上门|通缉令|逮捕令)/]
    },
    {
      id: 'urgency',
      category: 'pressure',
      weight: 8,
      label: '催你马上做',
      explanation: '制造紧迫感，是为了不让你思考。',
      patterns: [/(马上|立刻|立即|尽快|限时|今天|今晚|过期|最后|否则|来不及|赶紧|十分钟内|半小时内)/]
    },
    {
      id: 'brush_order',
      category: 'lure',
      weight: 32,
      label: '刷单、做任务返利',
      explanation: '所有刷单都是诈骗，前期返利只是鱼饵。',
      patterns: [/(刷单|刷信誉|做任务|返利|返佣|日赚|轻松赚|兼职刷|垫付|佣金|做单)/]
    },
    {
      id: 'free_gift',
      category: 'lure',
      weight: 15,
      label: '用免费、中奖吸引你',
      explanation: '免费的最贵，后面往往要你填信息或交钱。',
      patterns: [/(中奖|免费领|免费送|免费旅游|免费体检|红包|抽奖|礼品|返现|0元|一元购|免费鸡蛋)/]
    },
    {
      id: 'romance',
      category: 'lure',
      weight: 12,
      label: '打感情牌',
      explanation: '谈感情可以，一谈投资、借钱就要停。',
      patterns: [/(网恋|相亲|男朋友|女朋友|军人|维和|海外工作|异地恋|彩礼|情感)/]
    },
    {
      id: 'health_elderly',
      category: 'lure',
      weight: 15,
      label: '保健品、养老项目',
      explanation: '治病去医院，投资和子女商量。',
      patterns: [/(保健品|神药|包治百病|专家义诊|养老项目|以房养老|收藏品|拍卖|养老床位)/]
    },
    {
      id: 'job_abroad',
      category: 'lure',
      weight: 15,
      label: '境外高薪招聘',
      explanation: '轻松的高薪，可能是电诈园区的入口。',
      patterns: [/(高薪|包吃住|包机票|境外|缅北|出国打工|月入|招聘|客服岗|打字员)/]
    },
    {
      id: 'add_contact',
      category: 'social',
      weight: 12,
      label: '让你加微信、QQ 私聊',
      explanation: '离开官方平台私下联系，是为了躲开监管。',
      patterns: [/(加微信|加qq|加好友|添加客服|扫码加|微信联系|私聊|加我|联系我)/]
    },
    {
      id: 'click_link',
      category: 'link',
      weight: 12,
      label: '让你点链接',
      explanation: '陌生链接可能是钓鱼网站或木马。',
      patterns: [/(点击链接|点开链接|打开链接|链接领取|链接办理|点击查看|戳链接|点击下方)/]
    },
    {
      id: 'apk',
      category: 'link',
      weight: 25,
      critical: true,
      label: '让你下载安装包',
      explanation: '正规 App 从应用商店下载，别装来路不明的安装包。',
      patterns: [/(\.apk|安装包|扫码下载|下载安装|应用商店搜不到|卸载.{0,4}(国家反诈|反诈中心))/]
    },
    {
      id: 'qr_code',
      category: 'link',
      weight: 10,
      label: '让你扫码',
      explanation: '不明二维码可能让你付款、下载木马或填写信息。',
      patterns: [/(扫码|二维码)/]
    },
    {
      id: 'overseas_call',
      category: 'social',
      weight: 8,
      label: '境外或陌生来电',
      explanation: '境外号码自称公检法、客服，风险很高。',
      patterns: [/(境外来电|00开头|号码显示|陌生来电|境外号码)/]
    },
    {
      id: 'ai_voice',
      category: 'social',
      weight: 10,
      label: '视频、声音也可能造假',
      explanation: 'AI 可以换脸、克隆声音，暗号或回拨才可靠。',
      patterns: [/(ai换脸|换脸|拟声|克隆声音|合成声音|视频里|视频通话)/]
    }
  ];

  var SHORT_LINK_HOSTS = ['t.cn', 'dwz.cn', 'url.cn', 'bit.ly', 'tinyurl.com', 'goo.gl', 'sourl.cn'];
  var WARNING_CUE = /(谨防|防范|提醒您|警惕|这是诈骗|是骗子|不要相信陌生人|不要向陌生人转账|反诈宣传)/;
  var SAFE_CODE_WARNING = /(不要|别|勿|不能|切勿|请勿|不可).{0,4}(把|将)?(验证码|校验码|动态码|支付密码|交易密码).{0,4}(告诉|发给|给|报|提供|泄露)/;
  var AFFIRMATIVE_ASK = /(转给|转到|转入|汇款到|打到|存到|把验证码|验证码.{0,4}(发给|告诉|报给)|发.{0,4}验证码|给我.{0,4}验证码|索要验证码|屏幕共享|共享屏幕)/;

  function normalize(text) {
    var half = String(text || '').replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, ' ');
    return half.replace(/[\s​‌‍﻿]+/g, '').toLowerCase();
  }

  function truncate(str, max) {
    var s = String(str || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function extractLinks(raw) {
    var re = /(https?:\/\/[^\s，。！？；、"'）)】]+|www\.[^\s，。！？；、"'）)】]+)/gi;
    var found = [];
    var seen = {};
    var match;
    while ((match = re.exec(raw)) !== null) {
      var url = match[0].replace(/[.,;:!?]+$/, '');
      var key = url.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      var host = '';
      try {
        host = new URL(url.indexOf('http') === 0 ? url : 'http://' + url).hostname.toLowerCase();
      } catch (err) {
        host = url.split('/')[0].toLowerCase();
      }
      found.push({ url: url, host: host });
    }
    return found;
  }

  function analyze(input) {
    var raw = String(input || '').trim();
    var compact = normalize(raw);
    var signals = [];
    var seenRules = {};

    RULES.forEach(function (rule) {
      if (seenRules[rule.id]) return;
      for (var i = 0; i < rule.patterns.length; i++) {
        var m = rule.patterns[i].exec(compact);
        if (m) {
          seenRules[rule.id] = true;
          signals.push({
            id: rule.id,
            category: rule.category,
            weight: rule.weight,
            critical: !!rule.critical,
            label: rule.label,
            explanation: rule.explanation,
            excerpt: truncate(m[0], 24)
          });
          break;
        }
      }
    });

    var links = extractLinks(raw);
    var seenHosts = {};
    links.forEach(function (link) {
      if (!link.host || seenHosts[link.host]) return;
      seenHosts[link.host] = true;
      if (Object.keys(seenHosts).length > 2) return;
      signals.push({
        id: 'url_' + link.host,
        category: 'link',
        weight: 15,
        critical: false,
        label: '消息里有一个链接',
        explanation: '不要点开。可以先截图发给家人，让他们帮您看看。',
        excerpt: link.host
      });
      if (SHORT_LINK_HOSTS.indexOf(link.host) !== -1) {
        signals.push({
          id: 'short_' + link.host,
          category: 'link',
          weight: 20,
          critical: false,
          label: '链接是短链接，看不出真假',
          explanation: '短链接会把真实网址藏起来，更容易是钓鱼网站。',
          excerpt: link.host
        });
      }
    });

    signals.sort(function (a, b) { return b.weight - a.weight; });

    var categoryScores = {};
    signals.forEach(function (signal) {
      categoryScores[signal.category] = (categoryScores[signal.category] || 0) + signal.weight;
    });
    var score = 0;
    Object.keys(categoryScores).forEach(function (cat) {
      score += Math.min(categoryScores[cat], CATEGORY_CAPS[cat] || 40);
    });
    score = Math.min(100, score);

    var safeCodeWarning = SAFE_CODE_WARNING.test(compact);
    var affirmativeAsk = AFFIRMATIVE_ASK.test(compact) && !safeCodeWarning;
    var isWarning = (WARNING_CUE.test(compact) || safeCodeWarning) && !affirmativeAsk && !/安全账户/.test(compact);
    var hasCritical = signals.some(function (s) { return s.critical; });
    var asksForCode = signals.some(function (s) { return s.id === 'verification_code'; });
    var otpDelivery = !isWarning && !asksForCode &&
      /(验证码|校验码|动态码)(是|为|:)?[0-9]{4,8}/.test(compact) &&
      !/(安全账户|屏幕共享|共享屏幕)/.test(compact);
    var level;
    if (isWarning) {
      level = 'low';
    } else if (hasCritical || score >= 50) {
      level = 'high';
    } else if (score >= 25) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return {
      inputLength: raw.length,
      level: level,
      score: score,
      signals: signals,
      links: links,
      protective: isWarning,
      hasCritical: hasCritical,
      otp: otpDelivery && level === 'low'
    };
  }

  window.AnxinEngine = {
    analyze: analyze,
    CATEGORY_LABELS: CATEGORY_LABELS,
    normalize: normalize
  };
})();
