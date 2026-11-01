function word_to_u32(w) {
  let x = 0;
  for (let i = 0; w.$ === "WCon"; i++) {
    x |= Number(w.head) << i;
    w = w.tail;
  }
  return x >>> 0;
}

function u32_to_word(x) {
  let w = {$: "WNil"};
  for (let i = 31; i >= 0; i--) {
    w = {$: "WCon", head: ((x >>> i) & 1) === 1, tail: w};
  }
  return w;
}

function cmp_new(a, b) {
  return {$: a < b ? "LT" : a === b ? "EQ" : "GT"};
}

function nat_divmod(a, b) {
  return b === 0 ? {$: "Tuple", fst: 0, snd: a}
    : {$: "Tuple", fst: Math.trunc(a / b), snd: a % b};
}

function nat_chk(n) {
  if (n > 281474976710655) {
    throw "bend: a Nat past the largest immediate 2^48-1";
  }
  return n;
}

function nat_in(n) {
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 53) {
    throw "bend: expected a Nat host number: an integer from 0 to 2^53";
  }
  return n;
}

function f32_show(x) {
  let s = "nan";
  for (let p = 1; x === x && p <= 9 && f32_round(s) !== x; p += 1) {
    s = String(Number(x.toExponential(p - 1)));
  }
  return (Object.is(x, -0) ? "-0" : s).replace("Infinity", "inf");
}

function f32_bits(x) {
  return new Uint32Array(new Float32Array([x]).buffer)[0];
}

function f32_from_bits(u) {
  return new Float32Array(new Uint32Array([u]).buffer)[0];
}

function f32_read(s) {
  const re = /^[\t\n\v\f\r ]*[+-]?((\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|inf(inity)?|nan)$/i;
  const v = f32_round(s.replace(/inf\w*/i, "Infinity"));
  return re.test(s) ? {$: "Some", value: v} : {$: "None"};
}

const f32_round = function f32_round(s) {
  const d = Number(s);
  const a = Math.abs(d);
  const f = Math.fround(a);
  const g = 2 * a - Math.min(f, 2 ** 128);
  if (g === f || Math.fround(g) !== g || g === Infinity) {
    return Math.sign(d) * f;
  }
  let k = 0;
  while (a * 2 ** k % 1 !== 0) {
    k += 1;
  }
  const [, i, r, e] = /(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
  const n = Number(e ?? 0) - r.length;
  const x = BigInt(i + r) * 2n ** BigInt(k) * 10n ** BigInt(Math.max(n, 0));
  const y = BigInt(a * 2 ** k) * 10n ** BigInt(Math.max(-n, 0));
  return Math.sign(d) * (x === y || x > y !== g > f ? f : g);
};

const char_new = function char_new(c) {
  return c < 55296 || c >= 57344 && c <= 1114111 ? String.fromCodePoint(c) : String.fromCharCode(56320, c >>> 22, c >>> 11 & 2047, c & 2047);
};

function char_len(s, at = 0) {
  return s[at] === "\uDC00" ? 4 : s.codePointAt(at) > 0xFFFF ? 2 : 1;
}

function char_code(s) {
  return s.length < 4 ? s.codePointAt(0)
    : (s.charCodeAt(1) << 22 | s.charCodeAt(2) << 11 | s.charCodeAt(3)) >>> 0;
}

function string_contains(s, p) {
  // A match must start at a Char boundary, not inside a packed U32 code.
  for (let at = 0; at <= s.length; at += char_len(s, at)) {
    if (s.startsWith(p, at)) {
      return true;
    }
  }
  return false;
}

function str_out(s) {
  return s.replace(/\uDC00[^]{3}/gu, "\uFFFD");
}

function str_in(s) {
  return s.replace(/\p{Cs}/gu, "\uFFFD");
}

// Array
// =====

function array_new(d, v) {
  if (d > 31) {
    throw "bend: an array past the deepest block class 31";
  }
  return Array(2 ** d).fill(v);
}

function array_node(a, b) {
  if (a.length !== b.length) {
    throw "bend: runtime fail-stop";
  }
  return a.concat(b);
}

function array_rmw(a, i, f) {
  const at = i % a.length;
  const old = a[at];
  a[at] = f(old);
  return {$: "Tuple", fst: a, snd: old};
}

// Run
// ===

function run_tail(f, x) {
  return {$: "$JMP", f: f.j?.f === f ? f.j : f, x};
}

function run_clo(j) {
  const f = (x) => run_loop(j(x));
  f.j = j;
  j.f = f;
  return f;
}

function run_loop(r) {
  while (r !== null && typeof r === "object" && r.$ === "$JMP") {
    r = r.f(r.x);
  }
  return r;
}

function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : run_loop(f(...a));
}

// Effect
// ======

const $0eff = Object.create(null);

function io_eff(k, run) {
  if (arguments.length > 2) {
    throw new Error("bend: " + k + " takes no need: an effect that waits parks itself");
  }
  if (k in $0eff) {
    throw new Error("bend: two effects register " + k);
  }
  $0eff[k] = run;
}
// Program
// =======

function $lazy_string(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $lazy_bool(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $closing(_c_0) {
  const _t_0 = char_code(_c_0);
  if (_t_0 == 34) {
    return true;
  } else if ((_t_0 & 1) == 0) {
    return false;
  } else if (_t_0 == 39) {
    return true;
  } else if ((_t_0 & 3) == 3) {
    return false;
  } else if (_t_0 == 8221) {
    return true;
  } else if ((_t_0 & 7) == 5) {
    return false;
  } else if (_t_0 == 8217) {
    return true;
  } else if (_t_0 == 41) {
    return true;
  } else {
    return false;
  }
}

function $after_closers(_s_0) {
  if (_s_0 === "") {
    return "";
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    return $lazy_string(($closing(_h_0)), run_clo($after_closers_c1(_t_0)), run_clo($after_closers_c2(_h_0,_t_0)));
  }
}

function $at_gap(_s_0) {
  if (_s_0 === "") {
    return true;
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    return $Char_is_space(_h_0);
  }
}

function $upper_after_space(_s_0) {
  if (_s_0 === "") {
    return false;
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    return $lazy_bool(($Char_is_space(_h_0)), run_clo($upper_after_space_c3(_t_0)), run_clo($upper_after_space_c4(_h_0)));
  }
}

function $ellipsis_gap(_s_0) {
  if (_s_0 === "") {
    return false;
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    return $Bool_and(($Char_is_space(_h_0)), run_loop($upper_after_space(_t_0)));
  }
}

function $two_dots(_s_0) {
  if (_s_0 !== "") {
    const _t_0 = _s_0.slice(0, char_len(_s_0));
    const _t_1 = char_code(_t_0);
    if (_t_1 == 46) {
      const _t_2 = _s_0.slice(char_len(_s_0));
      if (_t_2 !== "") {
        const _t_3 = _t_2.slice(0, char_len(_t_2));
        const _t_4 = char_code(_t_3);
        if (_t_4 == 46) {
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $word(_s_0) {
  if (_s_0 === "") {
    return "";
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    const _x_0 = ($Char_is_alpha(_h_0));
    const _x_1 = ($Char_is_eq(_h_0, "."));
    return $lazy_string((_x_0 || _x_1), run_clo($word_c5(_h_0,_t_0)), run_clo($word_c6()));
  }
}

function $initial(_s_0) {
  if (_s_0 !== "") {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    if (_t_0 === "") {
      return $Char_is_upper(_h_0);
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function $abbreviation(_w_0) {
  const _l_0 = ($String_to_lower(_w_0));
  const _x_0 = ($initial(_w_0));
  const _x_1 = ($String_eq(_l_0, "mr"));
  const _x_2 = (_x_0 || _x_1);
  const _x_3 = ($String_eq(_l_0, "mrs"));
  const _x_4 = (_x_2 || _x_3);
  const _x_5 = ($String_eq(_l_0, "ms"));
  const _x_6 = (_x_4 || _x_5);
  const _x_7 = ($String_eq(_l_0, "dr"));
  const _x_8 = (_x_6 || _x_7);
  const _x_9 = ($String_eq(_l_0, "prof"));
  const _x_10 = (_x_8 || _x_9);
  const _x_11 = ($String_eq(_l_0, "sr"));
  const _x_12 = (_x_10 || _x_11);
  const _x_13 = ($String_eq(_l_0, "jr"));
  const _x_14 = (_x_12 || _x_13);
  const _x_15 = ($String_eq(_l_0, "st"));
  const _x_16 = (_x_14 || _x_15);
  const _x_17 = ($String_eq(_l_0, "vs"));
  const _x_18 = (_x_16 || _x_17);
  const _x_19 = ($String_eq(_l_0, "etc"));
  const _x_20 = (_x_18 || _x_19);
  const _x_21 = ($String_eq(_l_0, "e.g"));
  const _x_22 = (_x_20 || _x_21);
  const _x_23 = ($String_eq(_l_0, "i.e"));
  const _x_24 = (_x_22 || _x_23);
  const _x_25 = ($String_eq(_l_0, "no"));
  const _x_26 = (_x_24 || _x_25);
  const _x_27 = ($String_eq(_l_0, "fig"));
  const _x_28 = (_x_26 || _x_27);
  const _x_29 = ($String_eq(_l_0, "approx"));
  return (_x_28 || _x_29);
}

function $boundary(_c_0, _before_0, _after_0) {
  const _t_0 = char_code(_c_0);
  if (_t_0 == 10) {
    return true;
  } else if (_t_0 == 8230) {
    return $ellipsis_gap(run_loop($after_closers(_after_0)));
  } else if (_t_0 == 46) {
    return $Bool_pick(($two_dots(_before_0)), ($ellipsis_gap(run_loop($after_closers(_after_0)))), ($Bool_and(($at_gap(run_loop($after_closers(_after_0)))), ($Bool_not(($abbreviation(($String_reverse(run_loop($word(_before_0)))))))))));
  } else if ((_t_0 & 1) == 0) {
    return false;
  } else if (_t_0 == 13) {
    return true;
  } else if ((_t_0 & 7) == 5) {
    return false;
  } else if (_t_0 == 33) {
    return $at_gap(run_loop($after_closers(_after_0)));
  } else if ((_t_0 & 7) == 1) {
    return false;
  } else if (_t_0 == 63) {
    return $at_gap(run_loop($after_closers(_after_0)));
  } else {
    return false;
  }
}

function $state_acc(_s_0) {
  const _a_0 = _s_0["acc"];
  return _a_0;
}

function $state_out(_s_0) {
  const _o_0 = _s_0["out"];
  return _o_0;
}

function $flush(_cut_0, _acc_0, _out_0) {
  if (_cut_0) {
    return {$: "State", "acc": "", "out": {$: "Con", "head": ($String_reverse(_acc_0)), "tail": _out_0}};
  } else {
    return {$: "State", "acc": _acc_0, "out": _out_0};
  }
}

function $scan($0, $1, $2, $3) {
  for (;;) {
    {
      const _s_0 = $0;
      const _acc_0 = $1;
      const _out_0 = $2;
      const _pending_0 = $3;
      if (_s_0 === "") {
        return $Bool_pick(($String_is_empty(_acc_0)), ($List_reverse(_out_0)), ($List_reverse({$: "Con", "head": ($String_reverse(_acc_0)), "tail": _out_0})));
      } else {
        const _h_0 = _s_0.slice(0, char_len(_s_0));
        const _t_0 = _s_0.slice(char_len(_s_0));
        const _state_0 = ($flush(($Bool_and(($Bool_and(_pending_0, ($Bool_not(($Char_is_space(_h_0)))))), ($Bool_not(($Bool_and(($closing(_h_0)), ($Bool_not(($at_gap(_acc_0)))))))))), _acc_0, _out_0));
        const _a_0 = ($state_acc(_state_0));
        const _o_0 = ($state_out(_state_0));
        const _next_0 = ($boundary(_h_0, _a_0, _t_0));
        const _x_0 = ($Char_is_space(_h_0));
        const _x_1 = ($closing(_h_0));
        const _x_2 = ($Bool_and(_pending_0, (_x_0 || _x_1)));
        $0 = _t_0;
        $1 = (_h_0 + _a_0);
        $2 = _o_0;
        $3 = (_next_0 || _x_2);
        continue;
      }
    }
  }
}

function $last_space($0, $1, $2, $3) {
  for (;;) {
    {
      const _s_0 = $0;
      const _n_0 = $1;
      const _pos_0 = $2;
      const _last_0 = $3;
      if (_s_0 === "") {
        return _last_0;
      } else {
        const _h_0 = _s_0.slice(0, char_len(_s_0));
        const _t_0 = _s_0.slice(char_len(_s_0));
        if (_n_0 === 0) {
          return _last_0;
        } else {
          const _p_0 = (_n_0 - 1);
          $0 = _t_0;
          $1 = _p_0;
          $2 = nat_chk(_pos_0 + 1);
          $3 = ($Bool_pick(($Char_is_eq(_h_0, " ")), nat_chk(_pos_0 + 1), _last_0));
          continue;
        }
      }
    }
  }
}

function $choose(_n_0, _max_0) {
  if (_n_0 === 0) {
    return _max_0;
  } else {
    const _p_0 = (_n_0 - 1);
    return nat_chk(_p_0 + 1);
  }
}

function $limit(_fuel_0, _s_0, _max_0) {
  if (_fuel_0 === 0) {
    return {$: "Nil"};
  } else {
    const _f_0 = (_fuel_0 - 1);
    if (_s_0 === "") {
      return {$: "Nil"};
    } else {
      const _h_0 = _s_0.slice(0, char_len(_s_0));
      const _t_0 = _s_0.slice(char_len(_s_0));
      const _whole_0 = (_h_0 + _t_0);
      const _n_0 = ($Bool_pick(($Nat_is_le([...str_out(_whole_0)].length, _max_0)), [...str_out(_whole_0)].length, ($choose(($last_space(_whole_0, _max_0, 0, 0)), _max_0))));
      return {$: "Con", "head": ($String_take(_whole_0, _n_0)), "tail": ($limit(_f_0, ($String_drop(_whole_0, _n_0)), _max_0))};
    }
  }
}

function $limits(_xs_0, _max_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return $List_append(($limit([...str_out(_h_0)].length, _h_0, _max_0)), ($limits(_t_0, _max_0)));
  }
}

function $Splitter_split(_text_0, _max_0) {
  return $limits(($scan(_text_0, "", {$: "Nil"}, false)), (1 > _max_0 ? 1 : _max_0));
}

function $Char_is_space(_c_0) {
  const _x_0 = char_code(_c_0);
  const _x_1 = char_code(_c_0);
  const _x_2 = char_code(_c_0);
  const _x_3 = (_x_0 === 32);
  const _x_4 = ($Bool_and((_x_1 >= 9), (_x_2 <= 13)));
  return (_x_3 || _x_4);
}

function $Char_is_upper(_c_0) {
  const _x_0 = char_code(_c_0);
  const _x_1 = char_code(_c_0);
  return $Bool_and((_x_0 >= 65), (_x_1 <= 90));
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Char_is_alpha(_c_0) {
  const _x_0 = ($Char_is_upper(_c_0));
  const _x_1 = ($Char_is_lower(_c_0));
  return (_x_0 || _x_1);
}

function $Char_is_eq(_a_0, _b_0) {
  const _x_0 = char_code(_a_0);
  const _x_1 = char_code(_b_0);
  return (_x_0 === _x_1);
}

function $String_to_lower(_s_0) {
  if (_s_0 === "") {
    return "";
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    return (($Char_to_lower(_h_0)) + ($String_to_lower(_t_0)));
  }
}

function $String_eq(_a_0, _b_0) {
  return $Cmp_is_eq(($String_order(_a_0, _b_0)));
}

function $Bool_pick(_c_0, _a_0, _b_0) {
  if (!_c_0) {
    return _b_0;
  } else {
    return _a_0;
  }
}

function $Bool_not(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $String_reverse(_s_0) {
  return $String_reverse_go(_s_0, "");
}

function $String_is_empty(_s_0) {
  if (_s_0 === "") {
    return true;
  } else {
    return false;
  }
}

function $List_reverse(_xs_0) {
  return $List_reverse_go(_xs_0, {$: "Nil"});
}

function $Nat_is_le(_a_0, _b_0) {
  return $Cmp_is_le(cmp_new(_a_0, _b_0));
}

function $String_take(_s_0, _n_0) {
  if (_s_0 === "") {
    return "";
  } else {
    const _h_0 = _s_0.slice(0, char_len(_s_0));
    const _t_0 = _s_0.slice(char_len(_s_0));
    if (_n_0 === 0) {
      return "";
    } else {
      const _p_0 = (_n_0 - 1);
      return (_h_0 + ($String_take(_t_0, _p_0)));
    }
  }
}

function $String_drop($0, $1) {
  for (;;) {
    {
      const _s_0 = $0;
      const _n_0 = $1;
      if (_s_0 === "") {
        return "";
      } else {
        const _h_0 = _s_0.slice(0, char_len(_s_0));
        const _t_0 = _s_0.slice(char_len(_s_0));
        if (_n_0 === 0) {
          return (_h_0 + _t_0);
        } else {
          const _p_0 = (_n_0 - 1);
          $0 = _t_0;
          $1 = _p_0;
          continue;
        }
      }
    }
  }
}

function $List_append(_xs_0, _ys_0) {
  if (_xs_0.$ === "Nil") {
    return _ys_0;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Con", "head": _h_0, "tail": ($List_append(_t_0, _ys_0))};
  }
}

function $Char_is_lower(_c_0) {
  const _x_0 = char_code(_c_0);
  const _x_1 = char_code(_c_0);
  return $Bool_and((_x_0 >= 97), (_x_1 <= 122));
}

function $Char_to_lower(_c_0) {
  const _x_0 = ($Bool_to_u32(($Char_is_upper(_c_0))));
  const _x_1 = char_code(_c_0);
  const _x_2 = (Math.imul(_x_0, 32) >>> 0);
  return char_new(((_x_1 + _x_2) >>> 0));
}

function $Cmp_is_eq(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $String_order(_a_0, _b_0) {
  return $String_order_go(_a_0, _b_0, {$: "EQ"});
}

function $String_reverse_go($0, $1) {
  for (;;) {
    {
      const _s_0 = $0;
      const _acc_0 = $1;
      if (_s_0 === "") {
        return _acc_0;
      } else {
        const _h_0 = _s_0.slice(0, char_len(_s_0));
        const _t_0 = _s_0.slice(char_len(_s_0));
        $0 = _t_0;
        $1 = (_h_0 + _acc_0);
        continue;
      }
    }
  }
}

function $List_reverse_go($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _acc_0 = $1;
      if (_xs_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _h_0 = _xs_0["head"];
        const _t_0 = _xs_0["tail"];
        $0 = _t_0;
        $1 = {$: "Con", "head": _h_0, "tail": _acc_0};
        continue;
      }
    }
  }
}

function $Cmp_is_le(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $Bool_to_u32(_b_0) {
  if (!_b_0) {
    return 0;
  } else {
    return 1;
  }
}

function $String_order_go($0, $1, $2) {
  for (;;) {
    {
      const _a_0 = $0;
      const _b_0 = $1;
      const _c_0 = $2;
      if (_a_0 === "") {
        if (_b_0 !== "") {
          if (_c_0.$ === "EQ") {
            return {$: "LT"};
          } else {
            return _c_0;
          }
        } else {
          return _c_0;
        }
      } else {
        const _t_1 = _a_0.slice(0, char_len(_a_0));
        const _t_2 = _a_0.slice(char_len(_a_0));
        if (_b_0 === "") {
          if (_c_0.$ === "EQ") {
            return {$: "GT"};
          } else {
            return _c_0;
          }
        } else {
          const _t_3 = _b_0.slice(0, char_len(_b_0));
          const _t2_0 = _b_0.slice(char_len(_b_0));
          if (_c_0.$ === "EQ") {
            const _x_0 = char_code(_t_1);
            const _x_1 = char_code(_t_3);
            $0 = _t_2;
            $1 = _t2_0;
            $2 = cmp_new(_x_0, _x_1);
            continue;
          } else {
            return _c_0;
          }
        }
      }
    }
  }
}

function $after_closers_c1(_t_0) {
  return (_x_0) => {
    return $after_closers(_t_0);
  }
}
function $after_closers_c2(_h_0,_t_0) {
  return (_x_1) => {
    return (_h_0 + _t_0);
  }
}
function $upper_after_space_c3(_t_0) {
  return (_x_0) => {
    return $upper_after_space(_t_0);
  }
}
function $upper_after_space_c4(_h_0) {
  return (_x_1) => {
    return $Char_is_upper(_h_0);
  }
}
function $word_c5(_h_0,_t_0) {
  return (_x_2) => {
    return (_h_0 + run_loop($word(_t_0)));
  }
}
function $word_c6() {
  return (_x_3) => {
    return "";
  }
}export default {
  "lazy_string": run_lib((a0,a1,a2) => str_out(run_loop($lazy_string(a0,a1,a2))), 3),
  "lazy_bool": run_lib((a0,a1,a2) => run_loop($lazy_bool(a0,a1,a2)), 3),
  "closing": run_lib((a0) => run_loop($closing(str_in(a0))), 1),
  "after_closers": run_lib((a0) => str_out(run_loop($after_closers(str_in(a0)))), 1),
  "at_gap": run_lib((a0) => run_loop($at_gap(str_in(a0))), 1),
  "upper_after_space": run_lib((a0) => run_loop($upper_after_space(str_in(a0))), 1),
  "ellipsis_gap": run_lib((a0) => run_loop($ellipsis_gap(str_in(a0))), 1),
  "two_dots": run_lib((a0) => run_loop($two_dots(str_in(a0))), 1),
  "word": run_lib((a0) => str_out(run_loop($word(str_in(a0)))), 1),
  "initial": run_lib((a0) => run_loop($initial(str_in(a0))), 1),
  "abbreviation": run_lib((a0) => run_loop($abbreviation(str_in(a0))), 1),
  "boundary": run_lib((a0,a1,a2) => run_loop($boundary(str_in(a0),str_in(a1),str_in(a2))), 3),
  "state_acc": run_lib((a0) => str_out(run_loop($state_acc(a0))), 1),
  "state_out": run_lib((a0) => run_loop($state_out(a0)), 1),
  "flush": run_lib((a0,a1,a2) => run_loop($flush(a0,str_in(a1),a2)), 3),
  "scan": run_lib((a0,a1,a2,a3) => run_loop($scan(str_in(a0),str_in(a1),a2,a3)), 4),
  "last_space": run_lib((a0,a1,a2,a3) => run_loop($last_space(str_in(a0),nat_in(a1),nat_in(a2),nat_in(a3))), 4),
  "choose": run_lib((a0,a1) => run_loop($choose(nat_in(a0),nat_in(a1))), 2),
  "limit": run_lib((a0,a1,a2) => run_loop($limit(nat_in(a0),str_in(a1),nat_in(a2))), 3),
  "limits": run_lib((a0,a1) => run_loop($limits(a0,nat_in(a1))), 2),
  "Splitter.split": run_lib((a0,a1) => run_loop($Splitter_split(str_in(a0),nat_in(a1))), 2),
};
