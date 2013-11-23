const St = imports.gi.St;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;
const Animation = imports.ui.animation;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GPasteItem = Me.imports.gpaste_item;
const Fuzzy = Me.imports.fuzzy;
const PrefsKeys = Me.imports.prefs_keys;

const ViewMode = {
    TEXT: 0,
    MARKUP: 1
};

const GPasteItemsView = new Lang.Class({
    Name: "GPasteItemsView",

    _init: function(statusbar) {
        this._statusbar = statusbar;

        this.actor = new St.ScrollView({
            overlay_scrollbars: true,
            style_class: 'gpaste-items-view-scrollbox'
        });
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'gpaste-items-view-box'
        });
        this.actor.add_actor(this._box);

        this._items = [];
        this._displayed_items = [];
        this._display_mode = ViewMode.TEXT;

        // this.connect(
        //     'displayed-items-changed',
        //     Lang.bind(this, this._on_items_changed)
        // );
        this.connect(
            'display-mode-changed',
            Lang.bind(this, this._on_display_mode_changed)
        );
    },

    _on_items_changed: function() {
        if(this.displayed_length === 0) {
            this.show_message("Empty");
        }
        else {
            this.hide_message();
        }
    },

    _on_display_mode_changed: function() {
        for(let i = 0; i < this._displayed_items.length; i++) {
            this.set_display_mode_for_item(
                this._displayed_items[i],
                this._display_mode
            );
        }
    },

    _connect_item_signals: function(item) {
        item.actor.connect("enter-event",
            Lang.bind(this, function(o, e) {
                this.unselect_all();
                this.select(o);
            })
        );
        item.actor.connect("leave-event",
            Lang.bind(this, function(o, e) {
                this.unselect(o);
            })
        );
        item.actor.connect("button-press-event",
            Lang.bind(this, function(o, e) {
                this.actor.add_style_pseudo_class('active');
            })
        );
        item.actor.connect("button-release-event",
            Lang.bind(this, function(o, e) {
                let button = e.get_button();
                this.actor.remove_style_pseudo_class('active');
                this.emit("item-clicked", button, item);
            })
        );
    },

    _is_actor_visible_on_scroll: function(actor, v_adjustment) {
        return (
            actor.y - actor.height >= v_adjustment.value
            && actor.y + actor.height < (v_adjustment.value + v_adjustment.page_size)
        );
    },

    remove_item: function(item) {
        Tweener.removeTweens(item.actor);
        Tweener.addTween(item.actor, {
            time: 0.3,
            transition: 'easeOutQuad',
            opacity: 0,
            height: 2,
            onComplete: Lang.bind(this, function() {
                this.select_next();
                let index = this.items.indexOf(item);
                let displayed_index = this._displayed_items.indexOf(item);

                if(index !== -1) {
                    this.items.splice(index, 1);
                    this.emit('items-changed');
                }
                if(displayed_index !== -1) {
                    this._displayed_items.splice(displayed_index, 1);
                    this.emit("displayed-items-changed");
                }

                item.destroy();
            })
        });
    },

    add_items: function(items) {
        for(let i = 0; i < items.length; i++) {
            let item = items[i];

            if(item instanceof GPasteItem.GPasteItem) {
                this.items.push(item);
                this._connect_item_signals(item);
                item.actor.hide();
            }
            else {
                throw new Error('not GPasteItem instance');
            }
        }

        this.emit('items-changed');
    },

    set_items: function(items) {
        this.clear();
        this.add_items(items);
    },

    show_message: function(text, show_spinner) {
        this.hide_message();

        let message_box = new St.BoxLayout();
        let message = new St.Label({
            text: text,
            style_class: 'gpaste-items-view-message'
        });
        message_box.add_actor(message);

        this._message_bin = new St.BoxLayout();
        this._message_bin.add(message_box, {
            x_fill: false,
            y_fill: false,
            expand: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this.actor.add_actor(this._message_bin);

        show_spinner = show_spinner || false;

        if(show_spinner) {
            let spinner = new Animation.AnimatedIcon(
                Utils.SPINNER_ICON,
                Utils.SPINNER_ICON_SIZE
            );
            spinner.play();
            this._message_bin.add_actor(spinner.actor);
        }
    },

    hide_message: function() {
        if(this._message_bin) {
            this._message_bin.destroy();
            this._message_bin = false;
            this.actor.add_actor(this._box);
        }
    },

    get_labels: function() {
        let labels = [];

        for(let i = 0; i < this._items.length; i++) {
            labels.push(this._items[i].content);
        }

        return labels;
    },

    clear: function() {
        for(let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            item.destroy();
        }

        this._items = [];
        this._displayed_items = [];
        this.emit('items-changed');
        this.emit("displayed-items-changed");
    },

    set_display_mode_for_item: function(item, mode) {
        if(!item instanceof GPasteItem.GPasteItem) return;

        if(mode === ViewMode.TEXT) {
            item.show_text();
        }
        else {
            item.show_markup();
        }
    },

    set_display_mode: function(mode) {
        if(mode === ViewMode.TEXT) {
            this._display_mode = ViewMode.TEXT;
        }
        else {
            this._display_mode = ViewMode.MARKUP;
        }

        this.emit("display-mode-changed");
    },

    filter: function(term) {
        if(Utils.is_blank(term)) return;

        this.hide_all();
        this.set_display_mode(ViewMode.MARKUP);

        let options = {
            pre: GPasteItem.HIGHLIGHT_MARKUP.START,
            post: GPasteItem.HIGHLIGHT_MARKUP.STOP,
            extract: function(arg) { return arg.get_text(); },
            escape: true,
            max_distance: 30,
            max_results: Utils.SETTINGS.get_int(PrefsKeys.FILTER_MAX_RESULTS)
        }
        let fuzzy = new Fuzzy.Fuzzy(options);
        let matches = fuzzy.filter(term, this.items);

        for(let i = 0; i < matches.length; i++) {
            let item = matches[i].original;
            item.set_markup(matches[i].string);
            this.show_item(item);
        }

        this.actor.vscroll.adjustment.value = 0;
        this.select_first();
    },

    show_item: function(item) {
        if(!item) {
            log("gpaste_items_view.js:show_item(): Bad item '%s'".format(item));
            return;
        }

        if(this._displayed_items.indexOf(item) === -1) {
            this.set_display_mode_for_item(item, this._display_mode);
            this._box.add_child(item.actor);
            this._displayed_items.push(item);
            this.emit("displayed-items-changed");
        }

        item.show();
    },

    hide_item: function(item) {
        let index = this._displayed_items.indexOf(item);

        if(index !== -1) {
            this._displayed_items.splice(index, 1);
            this.emit("displayed-items-changed");
        }

        this._box.remove_child(item.actor);
        item.hide();
    },

    show_all: function() {
        this.hide_all();

        for(let i = 0; i < this.items.length; i++) {
            this.show_item(this.items[i]);
        }

        this.select_first();
    },

    hide_all: function() {
        for(let i = 0; i < this.displayed_length; i++) {
            this._displayed_items[i].hide();
        }

        this._box.remove_all_children()
        this._displayed_items = [];
        this.emit("displayed-items-changed");
    },

    select_all: function() {
        for(let i = 0; i < this._displayed_items.length; i++) {
            this.select(this._displayed_items[i].actor);
        }
    },

    unselect_all: function() {
        for(let i = 0; i < this._displayed_items.length; i++) {
            this.unselect(this._displayed_items[i].actor);
        }
    },

    select: function(actor) {
        actor.add_style_pseudo_class("hover");
    },

    unselect: function(actor) {
        actor.remove_style_pseudo_class("hover");
    },

    get_selected: function() {
        let results = [];

        for(let i = 0; i < this._displayed_items.length; i++) {
            let item = this._displayed_items[i];

            if(item.actor.has_style_pseudo_class("hover")) {
                results.push(item);
            }
        }

        return results;
    },

    select_first: function() {
        if(this.displayed_length > 0) {
            this.unselect_all();
            this.select(this._displayed_items[0].actor);
        }
    },

    select_next: function() {
        let selected = this.get_selected();
        if(selected.length != 1) return;

        let next_actor = null;
        let children = this._box.get_children();

        for(let i = 0; i < children.length; i++) {
            if(children[i] == selected[0].actor) {
                next_actor = children[i+1];
                break;
            }
        }

        if(next_actor) {
            this.unselect_all();
            this.select(next_actor);

            let vscroll = this.actor.vscroll.adjustment;

            if(!this._is_actor_visible_on_scroll(next_actor, vscroll)) {
                vscroll.value =
                    (next_actor.y + next_actor.height)
                    - vscroll.page_size;
            }
        }
    },

    select_previous: function() {
        let selected = this.get_selected();
        if(selected.length != 1) return;

        let previous_actor = null;
        let children = this._box.get_children();

        for(let i = 0; i < children.length; i++) {
            if(children[i] == selected[0].actor && i > 0) {
                previous_actor = children[i-1];
                break;
            }
        }

        if(previous_actor) {
            this.unselect_all();
            this.select(previous_actor);

            let vscroll = this.actor.vscroll.adjustment;

            if(!this._is_actor_visible_on_scroll(previous_actor, vscroll)) {
                vscroll.value = previous_actor.y - previous_actor.height;
            }
        }
    },

    get items() {
        return this._items;
    },

    get length() {
        return this._items.length
    },

    get displayed_length() {
        return this._displayed_items.length;
    },

    destroy: function() {
        for(let i = 0; i < this._items.length; i++) {
            let item = this.items[i];
            item.destroy();
        }

        this.actor.destroy();
    }
});
Signals.addSignalMethods(GPasteItemsView.prototype);
