const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const TIMEOUT_IDS = {
    SCROLL: 0
};

const ANIMATION_TIMES = {
    SHORTCUT_EMBLEM: 0.3
};

const ItemsCounter = new Lang.Class({
    Name: "ListView.ItemsCounter",

    _init: function(list_model) {
        this.actor = new St.Label();
        this._list_model = list_model;
        this._list_model.connect(
            "changed::items",
            Lang.bind(this, this._on_changed)
        );
        this._count_text = "Total: %s";
    },

    _on_changed: function() {
        let count = this._list_model.length;
        this.actor.set_text(this._count_text.format(count));
    },

    destroy: function() {
        delete this._list_model;
        this.actor.destroy();
    }
});

const Model = new Lang.Class({
    Name: 'ListView.Model',

    _init: function() {
        this._items = [];
        this._validator = null;
    },

    _is_valid: function(item) {
        if(this._validator !== null) {
            return this._validator(item);
        }
        else {
            return true;
        }
    },

    _delete_item: function(index, item) {
        this._items.splice(index, 1);
        this.emit('item-deleted', item, index);
        this.emit('changed::items');
    },

    set_items: function(items) {
        this._items = [];
        let result_items = [];

        for(let i in items) {
            if(this._is_valid(items[i])) result_items.push(items[i]);
        }

        this._items = result_items;
        this.emit('items-setted');
        this.emit('changed::items');
    },

    append: function(item) {
        if(this._is_valid(item)) this._items.push(item);
    },

    get: function(index) {
        return this._items[index];
    },

    delete: function(index_or_function) {
        if(typeof index_or_function === 'function') {
            for(let i in this._items) {
                if(index_or_function(this._items[i])) {
                    this._delete_item(i, this._items[i]);
                }
            }
        }
        else {
            let item = this.get(index_or_function);
            this._delete_item(index_or_function, item);
        }
    },

    set_validator: function(func) {
        if(typeof func === 'function') {
            this._validator = func;
        }
    },

    unset_validator: function() {
        this._validator = null;
    },

    clear: function() {
        this._items = [];
        this.emit('changed::items');
    },

    destroy: function() {
        delete this._items;
        delete this._validator;
    },

    get length() {
        return this._items.length;
    },

    get items() {
        return this._items;
    }
});
Signals.addSignalMethods(Model.prototype);

const RendererBase = new Lang.Class({
    Name: 'ListView.RendererBase',

    _init: function(params) {
        this.params = Params.parse(params, {
            style_class: '',
            shortcut_style: '',
        });

        this.actor = new St.Table({
            style_class: this.params.style_class,
            reactive: true
        });
        this.actor.connect('destroy', Lang.bind(this, this.destroy));
    },

    get_display: function(model, index) {
        throw new Error('not implemented');
    },

    destroy: function() {
        delete this.params;

        if(this.actor) this.actor.destroy();
    }
});

const ListViewShortcutEmblem = new Lang.Class({
    Name: 'ListViewShortcutEmblem',

    _init: function(params) {
        this.params = Params.parse(params, {
            display: null,
            number: 0,
            style_class: '',
            padding: 5
        });

        this.actor = new St.Label({
            style_class: this.params.style_class,
            opacity: 0
        });

        this._display = this.params.display;
        this.number = this.params.number;
        this.overlay = true;

        Main.uiGroup.add_child(this.actor);
    },

    _reposition: function() {
        if(this._display === null) {
            throw new Error(
                'ListViewShortcutEmblem:_reposition(): this._display is null'
            );
        }

        let [x, y] = this._display.get_transformed_position()

        if(this.overlay) this.actor.x = x + this.params.padding;
        else this.actor.x = x - (this.params.padding + this.actor.width);

        this.actor.y = y + this.params.padding;
    },

    show: function(animation) {
        if(this.actor.opacity === 255) return;

        animation = animation === undefined ? true : animation;
        this._reposition();
        this.actor.show();

        if(animation === true) {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                opacity: 255,
                time: ANIMATION_TIMES.SHORTCUT_EMBLEM,
                transition: 'easeOutQuad'
            });
        }
        else {
            this.actor.opacity = 255;
        }
    },

    hide: function(animation) {
        if(this.actor.opacity === 0) return;

        animation = animation === undefined ? true : animation;

        if(animation === true) {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                opacity: 0,
                time: ANIMATION_TIMES.SHORTCUT_EMBLEM,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    this.actor.hide();
                })
            });
        }
        else {
            this.actor.opacity = 0;
            this.actor.hide();
        }
    },

    destroy: function() {
        delete this.params;
        this.actor.destroy();
    },

    set number(number) {
        if(number <= 0 && number >= 9) return;

        this._number = number;
        this.actor.set_text(number.toString());
    },

    get number() {
        return this._number;
    },

    set display(display) {
        this._display = display;
        this._display.connect('destroy', Lang.bind(this, this.destroy));
    }
});

const ListView = new Lang.Class({
    Name: 'ListView',

    _init: function(params) {
        this.params = Params.parse(params, {
            scrollview_style: '',
            box_style: '',
            shortcut_style: '',
            overlay_scrollbars: true,
            overlay_shortcut_emblems: true,
            renderer: null,
            model: null
        });

        this.actor = new St.ScrollView({
            overlay_scrollbars: this.params.overlay_scrollbars,
            style_class: this.params.scrollview_style
        });
        this.actor.set_pivot_point(0.5, 0.5);

        this._box = new St.BoxLayout({
            vertical: true,
            style_class: this.params.box_style
        });
        this.actor.add_actor(this._box);

        this._v_adjustment = this.actor.get_vscroll_bar().get_adjustment();
        this._v_adjustment.connect(
            'notify::value',
            Lang.bind(this, this._on_scroll_changed)
        );
        this._h_adjustment = this.actor.get_hscroll_bar().get_adjustment();

        this._displays = [];
        this._loading_items = false;
        this._preload_pages = 1.1;
        this._preload_point = 85; // %
        this._displays = [];
        this._renderer = null;
        this._model = null;
        this._overlay_shortcut_emblems = this.params.overlay_shortcut_emblems;
        this._shortcut_emblems_shown = false;

        if(this.params.renderer !== null) {
            this.set_renderer(this.params.renderer);
        }
        if(this.params.model !== null) {
            this.set_model(this.params.model);
        }
    },

    _remove_timeout: function() {
        if(TIMEOUT_IDS.SCROLL !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.SCROLL);
            TIMEOUT_IDS.SCROLL = 0;
        }
    },

    _on_scroll_changed: function() {
        this._remove_timeout();

        if(this._shortcut_emblems_shown) {
            this.hide_shortcuts(false);
            this.show_shortcuts(false);
        }

        if(this._loading_items || !this._is_need_preload()) return;

        TIMEOUT_IDS.SCROLL = Mainloop.timeout_add(200,
            Lang.bind(this, this._preload_items)
        );
    },

    _on_item_deleted: function(model, item, index) {
        let display = this._displays[index];
        if(display) this._remove_display(this._displays[index]);

        if(this._is_need_preload()) this._preload_items();
    },

    _on_items_setted: function() {
        this.clear();
        this._preload_items();
    },

    _remove_display: function(display) {
        let index = this._displays.indexOf(display);
        if(index !== -1) this._displays.splice(index, 1);
        display.destroy();
    },

    _connect_display_signals: function(display) {
        display.connect(
            'enter-event',
            Lang.bind(this, this._on_display_enter)
        );
        display.connect(
            'leave-event',
            Lang.bind(this, this._on_display_leave)
        );

        let click_action = new Clutter.ClickAction();
        click_action.connect(
            'long-press',
            Lang.bind(this, this._on_display_long_press)
        );
        click_action.connect(
            'clicked',
            Lang.bind(this, this._on_display_clicked)
        );
        display.add_action(click_action);
    },

    _on_display_enter: function(display, event) {
        this.unselect_all();
        this.select(display);
    },

    _on_display_leave: function(display, event) {
        this.unselect(display);
        this.unset_active(display);
    },

    _on_display_clicked: function(action, display) {
        this.unset_active(display);
        let button = action.get_button();
        let index = this._displays.indexOf(display);
        this.emit('clicked', button, display, this.model, index);
    },

    _on_display_long_press: function(action, display, state) {
        if (state === Clutter.LongPressState.QUERY) {
            this.set_active(display);
        }
        else if (state === Clutter.LongPressState.ACTIVATE) {
            let index = this._displays.indexOf(display);
            this.emit('long-press', action.get_button(), display, this.model, index);
        }
        else {
            // nothing
        }

        return true;
    },

    _add_shortcut_emblem_to_display: function(display) {
        let emblem = new ListViewShortcutEmblem({
            style_class: this.params.shortcut_style,
            display: display
        });
        display.shortcut = emblem;
    },

    _is_need_preload: function() {
        let load_position =
            this._v_adjustment.upper / 100 * this._preload_point;
        let current_position =
            this._v_adjustment.value + this._v_adjustment.page_size;

        return (current_position >= load_position)
    },

    _preload_items: function() {
        this._remove_timeout();
        this._loading_items = true;
        let loaded = this._box.get_n_children();

        if(loaded >= this.model.length) {
            this._loading_items = false;
            return;
        }

        let added_height = 0;
        let max_added_height = this._v_adjustment.page_size * this._preload_pages;

        for(let i = loaded; i < this.model.length; i++) {
            if(added_height >= max_added_height) break;

            let index = i;
            let renderer = new this.renderer();
            let display = renderer.get_display(this.model, i);
            if(!display) continue;
            this._box.add_child(display);
            this._connect_display_signals(display);
            this._displays.push(display);
            this._add_shortcut_emblem_to_display(display);
            added_height += display.height;
        }

        this._loading_items = false;
    },

    _is_actor_visible_on_scroll: function(actor, scroll) {
        let v_adjustment = scroll.vscroll.adjustment;

        return (
            actor.visible
            && actor.y >= v_adjustment.value
            && actor.y + actor.height < (v_adjustment.value + v_adjustment.page_size)
        );
    },

    _check_model: function(model) {
        if(!model instanceof Model) {
            let msg =
                'ListView:_check_model(): "%s" '.format(typeof model) +
                'is not ListView.Model';
            throw new Error(msg);
        }
    },

    set_renderer: function(renderer) {
        this._renderer = renderer;
    },

    get_renderer: function() {
        return this._renderer;
    },

    set_model: function(model) {
        if(this._model) this._model.destroy();

        this._check_model();
        this.clear();
        this._model = model;
        this._model.connect(
            'items-setted',
            Lang.bind(this, this._on_items_setted)
        );
        this._model.connect(
            'item-deleted',
            Lang.bind(this, this._on_item_deleted)
        );
    },

    get_model: function() {
        this._check_model();
        return this._model;
    },

    select: function(actor) {
        if(actor.has_style_pseudo_class('hover')) return;
        this.unselect_all();
        actor.add_style_pseudo_class("hover");
        this.emit('selected', actor);
    },

    set_active: function(actor) {
        actor.add_style_pseudo_class('active');
    },

    unset_active: function(actor) {
        actor.remove_style_pseudo_class('active');
    },

    unselect: function(actor) {
        if(!actor.has_style_pseudo_class('hover')) return;
        actor.remove_style_pseudo_class("hover");
        this.emit('unselected', actor)
    },

    unselect_all: function() {
        for(let i = 0; i < this._displays.length; i++) {
            this.unselect(this._displays[i]);
        }
    },

    get_selected_index: function() {
        let result = -1;

        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];

            if(display.has_style_pseudo_class("hover")) {
                result = i;
                break;
            }
        }

        return result;
    },

    select_first: function() {
        if(this._displays.length > 0) {
            this.select(this._displays[0]);
        }
    },

    select_next: function() {
        let selected_index = this.get_selected_index();
        if(selected_index === -1) return;

        let selected = this._displays[selected_index];
        let next_actor = this._displays[selected_index + 1];

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
        let previous_actor = this._displays[selected_index - 1];

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

    hide_shortcuts: function(animation) {
        this._shortcut_emblems_shown = false;

        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];
            display.shortcut.hide(animation);
            display.shortcut.number = 0;
        }
    },

    get_index_for_shortcut: function(number) {
        for(let i in this._displays) {
            let display = this._displays[i];

            if(display.shortcut.number === number) return i;
        }

        return -1;
    },

    scroll_to_value: function(value) {
        this._v_adjustment.value = value;
    },

    reset_scroll: function() {
        if(this._v_adjustment.value > 0) this.scroll_to_value(0);
    },

    get_display: function(index) {
        return this._displays[index] || null;
    },

    clear: function() {
        this._remove_timeout();
        this._displays = [];
        this._box.destroy_all_children();
    },

    destroy: function() {
        this._remove_timeout();
        if(this.model) this.model.destroy();
        this.actor.destroy();
        delete this._displays;
    },

    set renderer(renderer) {
        this.set_renderer(renderer);
    },

    get renderer() {
        return this.get_renderer();
    },

    set model(model) {
        this.set_model(model);
    },

    get model() {
        return this.get_model();
    },

    set overlay_shortcut_emblems(overlay) {
        this._overlay_shortcut_emblems = overlay;
    },

    get overlay_shortcut_emblems() {
        return this._overlay_shortcut_emblems;
    }
});
Signals.addSignalMethods(ListView.prototype);
