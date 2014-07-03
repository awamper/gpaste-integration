const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;

const Me = ExtensionUtils.getCurrentExtension();
const ListView = Me.imports.list_view;

const GPasteListView = new Lang.Class({
    Name: 'GPasteListView',
    Extends: ListView.ListView,

    _init: function(params) {
        this.parent(params);
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

    fade_out_display: function(display) {
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

        Tweener.addTween(clone, {
            time: 0.3,
            scale_x: 1.5,
            scale_y: 1.5,
            opacity: 0,
            transition: 'easeInOutCirc',
            onComplete: Lang.bind(this, function() {
                clone.destroy();
            })
        });
    }
});
