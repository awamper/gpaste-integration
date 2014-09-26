const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const ListView = Me.imports.list_view;

const GPasteListView = new Lang.Class({
    Name: 'GPasteListView',
    Extends: ListView.ListView,

    _init: function(params) {
        this.parent(params);

        this._select_on_hover = true;
    },

    _on_display_enter: function(display, event) {
        if(!this._select_on_hover) return;

        this.parent(display, event);
    },

    _on_display_leave: function(display, event) {
        if(!this._select_on_hover) return;

        this.parent(display, event);
    },

    select: function(actor) {
        if(actor._delegate._history_item.inactive) return;
        this.parent(actor);
    },

    select_next: function() {
        let selected_index = this.get_selected_index();
        if(selected_index === -1) return false;

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
            return true;
        }

        return false;
    },

    select_previous: function() {
        let selected_index = this.get_selected_index();
        if(selected_index === -1) return false;

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
            return true;
        }

        return false;
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

    show_shortcuts: function(animation) {
        this._shortcut_emblems_shown = true;
        let current_number = 1;

        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];
            display.shortcut.overlay = this.overlay_shortcut_emblems;

            if(display._delegate._history_item.inactive) continue;

            if(current_number > 1 && current_number <= 9) {
                display.shortcut.number = current_number;
                display.shortcut.show(animation);
                current_number++;
            }
            else if(current_number >= 9) {
                continue;
            }
            else {
                if(this._is_actor_visible_on_scroll(display, this.actor)) {
                    display.shortcut.number = current_number;
                    display.shortcut.show(animation);
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

    set select_on_hover(select) {
        this._select_on_hover = select;
    }
});
