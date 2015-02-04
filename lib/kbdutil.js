/**
 * Dependencies.
 */
var debugerror = require('debug')('noVNC:ERROR:KbdUtil');
debugerror.log = console.warn.bind(console);
var Keys = require('./keys');


var KbdUtil = module.exports = {
	/**
	 * Return true if a modifier which is not the specified char modifier (and
	 * is not shift) is down.
	 */
	hasShortcutModifier: function (charModifier, currentModifiers) {
		var mods = {};
		for (var key in currentModifiers) {
			if (parseInt(key) !== Keys.XK_Shift_L) {
				mods[key] = currentModifiers[key];
			}
		}

		var sum = 0;
		for (var k in currentModifiers) {
			if (mods[k]) {
				++sum;
			}
		}

		if (KbdUtil.hasCharModifier(charModifier, mods)) {
			return sum > charModifier.length;
		}
		else {
			return sum > 0;
		}
	},

	/**
	 * Return true if the specified char modifier is currently down.
	 */
	hasCharModifier: function (charModifier, currentModifiers) {
		if (charModifier.length === 0) { return false; }

		for (var i = 0; i < charModifier.length; ++i) {
			if (!currentModifiers[charModifier[i]]) {
				return false;
			}
		}
		return true;
	},

	/**
	 * Helper object tracking modifier key state and generates fake key events
	 * to compensate if it gets out of sync.
	 */
	ModifierSync: function (charModifier) {
		if (!charModifier) {
			if (isMac()) {
				// on Mac, Option (AKA Alt) is used as a char modifier
				charModifier = [Keys.XK_Alt_L];
			}
			else if (isWindows()) {
				// on Windows, Ctrl+Alt is used as a char modifier
				charModifier = [Keys.XK_Alt_L, Keys.XK_Control_L];
			}
			else if (isLinux()) {
				// on Linux, ISO Level 3 Shift (AltGr) is used as a char modifier
				charModifier = [Keys.XK_ISO_Level3_Shift];
			}
			else {
				charModifier = [];
			}
		}

		var state = {};

		state[Keys.XK_Control_L] = false;
		state[Keys.XK_Alt_L] = false;
		state[Keys.XK_ISO_Level3_Shift] = false;
		state[Keys.XK_Shift_L] = false;
		state[Keys.XK_Meta_L] = false;

		function sync(evt, keysym) {
			var result = [];

			function syncKey(keysym) {
				return {keysym: Keys.lookup(keysym), type: state[keysym] ? 'keydown' : 'keyup'};
			}

			if (evt.ctrlKey !== undefined &&
				evt.ctrlKey !== state[Keys.XK_Control_L] && keysym !== Keys.XK_Control_L) {
				state[Keys.XK_Control_L] = evt.ctrlKey;
				result.push(syncKey(Keys.XK_Control_L));
			}
			if (evt.altKey !== undefined &&
				evt.altKey !== state[Keys.XK_Alt_L] && keysym !== Keys.XK_Alt_L) {
				state[Keys.XK_Alt_L] = evt.altKey;
				result.push(syncKey(Keys.XK_Alt_L));
			}
			if (evt.altGraphKey !== undefined &&
				evt.altGraphKey !== state[Keys.XK_ISO_Level3_Shift] && keysym !== Keys.XK_ISO_Level3_Shift) {
				state[Keys.XK_ISO_Level3_Shift] = evt.altGraphKey;
				result.push(syncKey(Keys.XK_ISO_Level3_Shift));
			}
			if (evt.shiftKey !== undefined &&
				evt.shiftKey !== state[Keys.XK_Shift_L] && keysym !== Keys.XK_Shift_L) {
				state[Keys.XK_Shift_L] = evt.shiftKey;
				result.push(syncKey(Keys.XK_Shift_L));
			}
			if (evt.metaKey !== undefined &&
				evt.metaKey !== state[Keys.XK_Meta_L] && keysym !== Keys.XK_Meta_L) {
				state[Keys.XK_Meta_L] = evt.metaKey;
				result.push(syncKey(Keys.XK_Meta_L));
			}
			return result;
		}

		function syncKeyEvent(evt, down) {
			var obj = KbdUtil.getKeysym(evt);
			var keysym = obj ? obj.keysym : null;

			// first, apply the event itself, if relevant
			if (keysym !== null && state[keysym] !== undefined) {
				state[keysym] = down;
			}
			return sync(evt, keysym);
		}

		return {
			// sync on the appropriate keyboard event
			keydown: function(evt) { return syncKeyEvent(evt, true); },
			keyup: function(evt) { return syncKeyEvent(evt, false); },
			// Call this with a non-keyboard event (such as mouse events) to use its modifier state to synchronize anyway
			syncAny: function(evt) { return sync(evt); },

			// is a shortcut modifier down?
			hasShortcutModifier: function() {
				return KbdUtil.hasShortcutModifier(charModifier, state);
			},
			// if a char modifier is down, return the keys it consists of, otherwise return null
			activeCharModifier: function() {
				return KbdUtil.hasCharModifier(charModifier, state) ? charModifier : null;
			}
		};
	},

	/**
	 * Get a key ID from a keyboard event.
	 * May be a string or an integer depending on the available properties.
	 */
	getKey: function (evt) {
		if ('keyCode' in evt && 'key' in evt) {
			return evt.key + ':' + evt.keyCode;
		}
		else if ('keyCode' in evt) {
			return evt.keyCode;
		}
		else {
			return evt.key;
		}
	},

	/**
	 * Get the most reliable keysym value we can get from a key event.
	 * If char/charCode is available, prefer those, otherwise fall back to
	 * key/keyCode/which.
	 */
	getKeysym: function (evt) {
		var codepoint;

		if (evt.char && evt.char.length === 1) {
			codepoint = evt.char.charCodeAt();
		}
		else if (evt.charCode) {
			codepoint = evt.charCode;
		}
		else if (evt.keyCode && evt.type === 'keypress') {
			// IE10 stores the char code as keyCode, and has no other useful properties
			codepoint = evt.keyCode;
		}

		if (codepoint) {
			var res = Keys.fromUnicode(KbdUtil.substituteCodepoint(codepoint));
			if (res) {
				return res;
			}
		}

		// we could check evt.key here.
		// Legal values are defined in http://www.w3.org/TR/DOM-Level-3-Events/#key-values-list,
		// so we "just" need to map them to keysym, but AFAIK this is only available in IE10,
		// which also provides evt.key so we don't *need* it yet.
		if (evt.keyCode) {
			return Keys.lookup(KbdUtil.keysymFromKeyCode(evt.keyCode, evt.shiftKey));
		}
		if (evt.which) {
			return Keys.lookup(KbdUtil.keysymFromKeyCode(evt.which, evt.shiftKey));
		}
		return null;
	},

	/**
	 * Given a keycode, try to predict which keysym it might be.
	 * If the keycode is unknown, null is returned.
	 */
	keysymFromKeyCode: function (keycode, shiftPressed) {
		if (typeof(keycode) !== 'number') {
			return null;
		}
		// won't be accurate for azerty
		if (keycode >= 0x30 && keycode <= 0x39) {
			return keycode; // digit
		}
		if (keycode >= 0x41 && keycode <= 0x5a) {
			// remap to lowercase unless shift is down
			return shiftPressed ? keycode : keycode + 32; // A-Z
		}
		if (keycode >= 0x60 && keycode <= 0x69) {
			return Keys.XK_KP_0 + (keycode - 0x60); // numpad 0-9
		}

		switch(keycode) {
			case 0x20: return Keys.XK_space;
			case 0x6a: return Keys.XK_KP_Multiply;
			case 0x6b: return Keys.XK_KP_Add;
			case 0x6c: return Keys.XK_KP_Separator;
			case 0x6d: return Keys.XK_KP_Subtract;
			case 0x6e: return Keys.XK_KP_Decimal;
			case 0x6f: return Keys.XK_KP_Divide;
			case 0xbb: return Keys.XK_plus;
			case 0xbc: return Keys.XK_comma;
			case 0xbd: return Keys.XK_minus;
			case 0xbe: return Keys.XK_period;
		}

		return KbdUtil.nonCharacterKey({keyCode: keycode});
	},

	/**
	 * If the key is a known non-character key (any key which doesn't generate
	 * character data) return its keysym value. Otherwise return null.
	 */
	nonCharacterKey: function (evt) {
		// evt.key not implemented yet
		if (!evt.keyCode) { return null; }

		var keycode = evt.keyCode;

		if (keycode >= 0x70 && keycode <= 0x87) {
			return Keys.XK_F1 + keycode - 0x70; // F1-F24
		}

		switch (keycode) {
			case 8 : return Keys.XK_BackSpace;
			case 13 : return Keys.XK_Return;

			case 9 : return Keys.XK_Tab;

			case 27 : return Keys.XK_Escape;
			case 46 : return Keys.XK_Delete;

			case 36 : return Keys.XK_Home;
			case 35 : return Keys.XK_End;
			case 33 : return Keys.XK_Page_Up;
			case 34 : return Keys.XK_Page_Down;
			case 45 : return Keys.XK_Insert;

			case 37 : return Keys.XK_Left;
			case 38 : return Keys.XK_Up;
			case 39 : return Keys.XK_Right;
			case 40 : return Keys.XK_Down;

			case 16 : return Keys.XK_Shift_L;
			case 17 : return Keys.XK_Control_L;
			case 18 : return Keys.XK_Alt_L; // also: Option-key on Mac

			case 224 : return Keys.XK_Meta_L;
			case 225 : return Keys.XK_ISO_Level3_Shift; // AltGr
			case 91 : return Keys.XK_Super_L; // also: Windows-key
			case 92 : return Keys.XK_Super_R; // also: Windows-key
			case 93 : return Keys.XK_Menu; // also: Windows-Menu, Command on Mac

			default: return null;
		}
	},

	substituteCodepoint: function(cp) {
		// Any Unicode code points which do not have corresponding keysym entries
		// can be swapped out for another code point by adding them to this table.
		var substitutions = {
			// {S,s} with comma below -> {S,s} with cedilla
			0x218 : 0x15e,
			0x219 : 0x15f,
			// {T,t} with comma below -> {T,t} with cedilla
			0x21a : 0x162,
			0x21b : 0x163
		};

		var sub = substitutions[cp];
		return sub ? sub : cp;
	},

	/**
	 * Takes a DOM keyboard event and:
	 * - determines which keysym it represents.
	 * - determines a keyId  identifying the key that was pressed (corresponding
	 *   to the key/keyCode properties on the DOM event).
	 * - synthesizes events to synchronize modifier key state between which
	 *   modifiers are actually down, and which we thought were down.
	 * - marks each event with an 'escape' property if a modifier was down which
	 *   should be "escaped".
	 * - generates a "stall" event in cases where it might be necessary to wait
	 *   and see if a keypress event follows a keydown.
	 *
	 * This information is collected into an object which is passed to the next()
	 * function (one call per event).
	 */
	KeyEventDecoder: function (modifierState, next) {
		function sendAll(evts) {
			for (var i = 0; i < evts.length; ++i) {
				next(evts[i]);
			}
		}

		function process(evt, type) {
			var result = {type: type};
			var keyId = KbdUtil.getKey(evt);

			if (keyId) {
				result.keyId = keyId;
			}

			var keysym = KbdUtil.getKeysym(evt);

			var hasModifier = modifierState.hasShortcutModifier() || !!modifierState.activeCharModifier();

			// Is this a case where we have to decide on the keysym right away, rather than waiting for the keypress?
			// "special" keys like enter, tab or backspace don't send keypress events,
			// and some browsers don't send keypresses at all if a modifier is down
			if (keysym && (type !== 'keydown' || KbdUtil.nonCharacterKey(evt) || hasModifier)) {
				result.keysym = keysym;
			}

			var isShift = evt.keyCode === 0x10 || evt.key === 'Shift';

			// Should we prevent the browser from handling the event?
			// Doing so on a keydown (in most browsers) prevents keypress from being generated
			// so only do that if we have to.
			var suppress = !isShift && (type !== 'keydown' || modifierState.hasShortcutModifier() || !!KbdUtil.nonCharacterKey(evt));

			// If a char modifier is down on a keydown, we need to insert a stall,
			// so VerifyCharModifier knows to wait and see if a keypress is comnig
			var stall = type === 'keydown' && modifierState.activeCharModifier() && !KbdUtil.nonCharacterKey(evt);

			// if a char modifier is pressed, get the keys it consists of (on Windows, AltGr is equivalent to Ctrl+Alt)
			var active = modifierState.activeCharModifier();

			// If we have a char modifier down, and we're able to determine a keysym reliably
			// then (a) we know to treat the modifier as a char modifier,
			// and (b) we'll have to "escape" the modifier to undo the modifier when sending the char.
			if (active && keysym) {
				var isCharModifier = false;
				for (var i  = 0; i < active.length; ++i) {
					if (active[i] === keysym.keysym) {
						isCharModifier = true;
					}
				}
				if (type === 'keypress' && !isCharModifier) {
					result.escape = modifierState.activeCharModifier();
				}
			}

			if (stall) {
				// insert a fake "stall" event
				next({type: 'stall'});
			}
			next(result);

			return suppress;
		}

		return {
			keydown: function(evt) {
				sendAll(modifierState.keydown(evt));
				return process(evt, 'keydown');
			},
			keypress: function(evt) {
				return process(evt, 'keypress');
			},
			keyup: function(evt) {
				sendAll(modifierState.keyup(evt));
				return process(evt, 'keyup');
			},
			syncModifiers: function(evt) {
				sendAll(modifierState.syncAny(evt));
			},
			releaseAll: function() { next({type: 'releaseall'}); }
		};
	},

	/**
	 * Combines keydown and keypress events where necessary to handle char modifiers.
	 * On some OS'es, a char modifier is sometimes used as a shortcut modifier.
	 * For example, on Windows, AltGr is synonymous with Ctrl-Alt. On a Danish keyboard
	 * layout, AltGr-2 yields a @, but Ctrl-Alt-D does nothing so when used with the
	 * '2' key, Ctrl-Alt counts as a char modifier (and should be escaped), but when
	 * used with 'D', it does not.
	 * The only way we can distinguish these cases is to wait and see if a keypress
	 * event arrives. When we receive a "stall" event, wait a few ms before processing
	 * the next keydown. If a keypress has also arrived, merge the two.
	 */
	VerifyCharModifier: function (next) {
		var queue = [];
		var timer = null;

		function process() {
			if (timer) {
				return;
			}

			function delayProcess () {
				clearTimeout(timer);
				timer = null;
				process();
			}

			while (queue.length !== 0) {
				var cur = queue[0];
				queue = queue.splice(1);

				switch (cur.type) {
					case 'stall':
						// insert a delay before processing available events.
						/* jshint loopfunc: true */
						timer = setTimeout(delayProcess, 5);
						/* jshint loopfunc: false */
						return;
					case 'keydown':
						// is the next element a keypress? Then we should merge the two
						if (queue.length !== 0 && queue[0].type === 'keypress') {
							// Firefox sends keypress even when no char is generated.
							// so, if keypress keysym is the same as we'd have guessed from keydown,
							// the modifier didn't have any effect, and should not be escaped
							if (queue[0].escape && (!cur.keysym || cur.keysym.keysym !== queue[0].keysym.keysym)) {
								cur.escape = queue[0].escape;
							}
							cur.keysym = queue[0].keysym;
							queue = queue.splice(1);
						}
						break;
				}

				// swallow stall events, and pass all others to the next stage
				if (cur.type !== 'stall') {
					next(cur);
				}
			}
		}

		return function(evt) {
			queue.push(evt);
			process();
		};
	},

	/**
	 * Keeps track of which keys we (and the server) believe are down.
	 * When a keyup is received, match it against this list, to determine the
	 * corresponding keysym(s) in some cases, a single key may produce multiple
	 * keysyms, so the corresponding keyup event must release all of these chars
	 * key repeat events should be merged into a single entry.
	 * Because we can't always identify which entry a keydown or keyup event
	 * corresponds to, we sometimes have to guess.
	 */
	TrackKeyState: function (next) {
		var state = [];

		return function (evt) {
			var last = state.length !== 0 ? state[state.length-1] : null;

			switch (evt.type) {
				case 'keydown':
					// insert a new entry if last seen key was different.
					if (!last || !evt.keyId || last.keyId !== evt.keyId) {
						last = {keyId: evt.keyId, keysyms: {}};
						state.push(last);
					}
					if (evt.keysym) {
						// make sure last event contains this keysym (a single "logical" keyevent
						// can cause multiple key events to be sent to the VNC server)
						last.keysyms[evt.keysym.keysym] = evt.keysym;
						last.ignoreKeyPress = true;
						next(evt);
					}
					break;
				case 'keypress':
					if (!last) {
						last = {keyId: evt.keyId, keysyms: {}};
						state.push(last);
					}
					if (!evt.keysym) {
						debugerror('TrackKeyState() | keypress with no keysym:', evt);
					}

					// If we didn't expect a keypress, and already sent a keydown to the VNC server
					// based on the keydown, make sure to skip this event.
					if (evt.keysym && !last.ignoreKeyPress) {
						last.keysyms[evt.keysym.keysym] = evt.keysym;
						evt.type = 'keydown';
						next(evt);
					}
					break;
				case 'keyup':
					if (state.length === 0) {
						return;
					}
					var idx = null;
					// do we have a matching key tracked as being down?
					for (var i = 0; i !== state.length; ++i) {
						if (state[i].keyId === evt.keyId) {
							idx = i;
							break;
						}
					}
					// if we couldn't find a match (it happens), assume it was the last key pressed
					if (idx === null) {
						idx = state.length - 1;
					}

					var item = state.splice(idx, 1)[0];
					// for each keysym tracked by this key entry, clone the current event and override the keysym
					var clone = (function(){
						function Clone(){}
						return function (obj) { Clone.prototype=obj; return new Clone(); };
					}());
					for (var key in item.keysyms) {
						var out = clone(evt);
						out.keysym = item.keysyms[key];
						next(out);
					}
					break;
				case 'releaseall':
					/* jshint shadow: true */
					for (var i = 0; i < state.length; ++i) {
						for (var key in state[i].keysyms) {
							var keysym = state[i].keysyms[key];
							next({keyId: 0, keysym: keysym, type: 'keyup'});
						}
					}
					/* jshint shadow: false */
					state = [];
					break;
			}
		};
	},

	/**
	 * Handles "escaping" of modifiers: if a char modifier is used to produce a
	 * keysym (such as AltGr-2 to generate an @), then the modifier must be
	 * "undone" before sending the @, and "redone" afterwards.
	 */
	EscapeModifiers: function (next) {
		return function(evt) {
			var i;

			if (evt.type !== 'keydown' || evt.escape === undefined) {
				next(evt);
				return;
			}

			// undo modifiers
			for (i = 0; i < evt.escape.length; ++i) {
				next({type: 'keyup', keyId: 0, keysym: Keys.lookup(evt.escape[i])});
			}

			// send the character event
			next(evt);

			// redo modifiers
			for (i = 0; i < evt.escape.length; ++i) {
				next({type: 'keydown', keyId: 0, keysym: Keys.lookup(evt.escape[i])});
			}
		};
	}
};


/**
 * Private API.
 */


function isMac() {
	return navigator && !!(/mac/i).exec(navigator.platform);
}

function isWindows() {
	return navigator && !!(/win/i).exec(navigator.platform);
}

function isLinux() {
	return navigator && !!(/linux/i).exec(navigator.platform);
}