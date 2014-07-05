const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;

const Me = ExtensionUtils.getCurrentExtension();
const ListView = Me.imports.list_view;
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const GPasteListView = new Lang.Class({
    Name: 'GPasteListView',
    Extends: ListView.ListView,

    _init: function(params) {
        this.parent(params);
    },

    _lazy_load_items: function() {
        this._n_load_at_once = Utils.SETTINGS.get_int(
            PrefsKeys.LIST_VIEW_N_LOAD_AT_ONCE_KEY
        );
        this.parent();
    },

    select: function(actor) {
        if(actor._delegate._history_item.inactive) return;
        this.parent(actor);
    },

    select_next: function() {
        let selected_index = this.get_selected_index();
        if(selected_index === -1) return;

        let selected = this._displays[selected_index];
        let next_actor = null;

        for(let i = selected_index + 1; i < this._displays.length; i++) {
            if(!this._displays[i]._delegate._history_item.inactive) {
                next_actor = this._displays[i];
                break;
            }
        }

        if(next_actor) {
            let vscroll = this.actor.vscroll.adjustment;

            if(!this._is_actor_visible_on_scroll(next_actor, this.actor)) {
                vscroll.value =
                    (next_actor.y + next_actor.height)
                    - vscroll.page_size;
            }

            this.select(next_actor);
        }
    },

    select_previous: function() {
        let selected_index = this.get_selected_index();
        if(selected_index === -1) return;

        let selected = this._displays[selected_index];
        let previous_actor = null;

        for(let i = selected_index - 1; i >= 0; i--) {
            if(!this._displays[i]._delegate._history_item.inactive) {
                previous_actor = this._displays[i];
                break;
            }
        }

        if(previous_actor) {
            let vscroll = this.actor.vscroll.adjustment;

            if(!this._is_actor_visible_on_scroll(previous_actor, this.actor)) {
                vscroll.value = previous_actor.y - previous_actor.height;
            }

            this.select(previous_actor);
        }
    },

    select_first_visible: function() {
        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];
            if(display._delegate._history_item.inactive) continue;

            if(this._is_actor_visible_on_scroll(display, this.actor)) {
                this.select(display);
                break;
            }
        }
    },

    show_shortcuts: function() {
        let current_number = 1;

        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];
            if(display._delegate._history_item.inactive) continue;

            if(current_number > 1 && current_number <= 9) {
                display.shortcut.number = current_number;
                display.shortcut.show();
                current_number++;
            }
            else if(current_number >= 9) {
                continue;
            }
            else {
                if(this._is_actor_visible_on_scroll(display, this.actor)) {
                    display.shortcut.number = current_number;
                    display.shortcut.show();
                    current_number++;
                }
            }
        }
    },

    get_display_for_item: function(history_item) {
        let result = null;

        for each(let display in this._displays) {
            if(display._delegate._history_item === history_item) {
                result = display;
                break;
            }
        }

        return result;
    },

    fade_out_display: function(display) {
        let animation = Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);
        if(!animation) return;

        let [x, y] = display.get_transformed_position();
        let clone = new Clutter.Clone({
            source: display,
            width: display.width,
            height: display.height,
            x: x,
            y: y
        });
        clone.set_pivot_point(0.5, 0.5);
        Main.uiGroup.add_child(clone);

        let transition = Utils.SETTINGS.get_string(
            PrefsKeys.ACTIVATE_TRANSITION_TYPE_KEY
        );
        let time = Utils.SETTINGS.get_double(
            PrefsKeys.ACTIVATE_ANIMATION_TIME_KEY
        );
        Tweener.addTween(clone, {
            time: time,
            scale_x: 1.5,
            scale_y: 1.5,
            opacity: 0,
            transition: transition,
            onComplete: Lang.bind(this, function() {
                clone.destroy();
            })
        });
    }
});
