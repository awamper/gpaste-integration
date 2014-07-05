const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const ANIMATION_TIMES = {
    SHORTCUT_EMBLEM: 0.3
};

const LOAD_STATES = {
    NONE: 0,
    STARTED: 1,
    LOADING: 2,
    FINISHED: 3
};

const LoadingProgress = new Lang.Class({
    Name: 'ListView.LoadingProgress',

    _init: function(list_view, params) {
        this.params = Params.parse(params, {
            hide_on_finish: false,
            max_width: 100,
            height: 5,
            animation: true,
            animation_time: 0.3,
            style_class: ''
        });

        this.actor = new St.Bin({
            height: this.params.height,
            width: 0,
            style_class: this.params.style_class,
            visible: false
        });

        this._list_view = list_view;
        this._start_id = this._list_view.connect(
            'loading-start',
            Lang.bind(this, this._on_start)
        );
        this._continue_id = this._list_view.connect(
            'loading-continue',
            Lang.bind(this, this._on_changed)
        );
        this._finish_id = this._list_view.connect(
            'loading-finish',
            Lang.bind(this, this._on_finish)
        );

        this.max_width = this.params.max_width;
    },

    _on_start: function() {
        this._reset();
        this.actor.show();
    },

    _on_finish: function() {
        this._set_progress(100);
    },

    _on_changed: function() {
        let progress = Math.ceil(
            100 / this._list_view.model.length * this._list_view.n_loaded_items
        );
        this._set_progress(progress);
    },

    _set_progress: function(progress) {
        let width = Math.floor(this.max_width / 100 * progress);

        if(!this.params.animation) {
            this.actor.width = width;
            return;
        }

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            transition: 'easeOutQuad',
            time: this.params.animation_time,
            width: width,
            onComplete: Lang.bind(this, function() {
                if(this.params.hide_on_finish && progress >= 100) {
                    this.hide();
                }
            })
        });
    },

    _reset: function() {
        this.actor.width = 0;
    },

    show: function() {
        if(this.actor.visible) return;

        if(!this.params.animation) {
            this.actor.show();
            return;
        }

        this.actor.set_opacity(0);
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            transition: 'easeOutQuad',
            time: this.params.animation_time,
            opacity: 255
        });
    },

    hide: function() {
        if(!this.actor.visible) return;

        if(!this.params.animation) {
            this.actor.hide();
            return;
        }

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            transition: 'easeOutQuad',
            time: this.params.animation_time,
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.actor.set_opacity(255);
            })
        });
    },

    destroy: function() {
        if(this._continue_id > 0) {
            this._list_view.disconnect(this._continue_id);
            this._continue_id = 0;
        }
        if(this._finish_id > 0) {
            this._list_view.disconnect(this._finish_id);
            this._finish_id = 0;
        }

        this.actor.destroy();
    },

    set max_width(max_width) {
        this._max_width = max_width;
    },

    get max_width() {
        return this._max_width;
    }
});

const ItemsCounter = new Lang.Class({
    Name: "ListView.ItemsCounter",

    _init: function(list_view) {
        this.actor = new St.Label();

        this._list_view = list_view;
        this._list_view_connection_id = this._list_view.connect(
            'loading-continue',
            Lang.bind(this, this._on_changed)
        );
        this._list_view_finish_connection_id = this._list_view.connect(
            'loading-finish',
            Lang.bind(this, this._on_changed, true)
        );
        this._model_connection_id = this._list_view.model.connect(
            "changed::items",
            Lang.bind(this, this._on_changed)
        );
    },

    _on_changed: function(object, loading_finish) {
        let text = 'Total: ';
        if(!loading_finish) text += this._list_view.n_loaded_items + '/';
        text += this._list_view.model.length;

        this.actor.set_text(text);
    },

    destroy: function() {
        if(this._model_connection_id > 0) {
            this._list_view.model.disconnect(this._model_connection_id);
            this._model_connection_id = 0;
        }
        if(this._list_view_connection_id > 0) {
            this._list_view.disconnect(this._list_view_connection_id);
            this._list_view_connection_id = 0;
        }
        if(this._list_view_finish_connection_id > 0) {
            this._list_view.disconnect(this._list_view_finish_connection_id);
            this._list_view_finish_connection_id = 0;
        }

        delete this._list_view;
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

const ShortcutEmblem = new Lang.Class({
    Name: 'ShortcutEmblem',

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

        Main.uiGroup.add_child(this.actor);
    },

    _reposition: function() {
        if(this._display === null) {
            throw new Error(
                'ListView.ShortcutEmblem:_reposition(): this._display is null'
            );
        }

        let [x, y] = this._display.get_transformed_position()
        this.actor.x = x + this.params.padding;
        this.actor.y = y + this.params.padding;
    },

    show: function() {
        if(this.actor.opacity === 255) return;

        this._reposition();
        this.actor.show();
        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 255,
            time: ANIMATION_TIMES.SHORTCUT_EMBLEM,
            transition: 'easeOutQuad'
        });
    },

    hide: function() {
        if(this.actor.opacity === 0) return;

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            time: ANIMATION_TIMES.SHORTCUT_EMBLEM,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
            })
        });
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
            renderer: null,
            model: null,
            n_load_at_once: 10
        });

        this.actor = new St.ScrollView({
            overlay_scrollbars: this.params.overlay_scrollbars,
            style_class: this.params.scrollview_style
        });
        this.actor.set_pivot_point(0.5, 0.5);

        this._v_adjustment = this.actor.get_vscroll_bar().get_adjustment();
        this._h_adjustment = this.actor.get_hscroll_bar().get_adjustment();

        this._box = new St.BoxLayout({
            vertical: true,
            style_class: this.params.box_style
        });
        this.actor.add_actor(this._box);

        this._displays = [];
        this._renderer = null;
        this._model = null;

        this._load_id = 0;
        this._load_state = LOAD_STATES.NONE;
        this._n_loaded = 0;
        this._n_load_at_once = this.params.n_load_at_once;

        if(this.params.renderer !== null) {
            this.set_renderer(this.params.renderer);
        }
        if(this.params.model !== null) {
            this.set_model(this.params.model);
        }
    },

    _on_item_deleted: function(model, item, index) {
        let display = this._displays[index];
        if(display) this._remove_display(this._displays[index]);
    },

    _on_items_setted: function() {
        this.clear();
        this._lazy_load_items();
    },

    _remove_display: function(display) {
        let index = this._displays.indexOf(display);
        if(index !== -1) this._displays.splice(index, 1);
        display.destroy();
    },

    _connect_display_signals: function(display) {
        display.connect("enter-event",
            Lang.bind(this, function(o, e) {
                this.unselect_all();
                this.select(display);
            })
        );
        display.connect("leave-event",
            Lang.bind(this, function(o, e) {
                this.unselect(display);
                this.unset_active(display);
            })
        );
        display.connect("button-press-event",
            Lang.bind(this, function(o, e) {
                this.set_active(display);
            })
        );
        display.connect("button-release-event",
            Lang.bind(this, function(o, e) {
                let button = e.get_button();
                this.unset_active(display);
                let index = this._displays.indexOf(display);
                this.emit("clicked", button, display, this.model, index);
            })
        );
    },

    _add_shortcut_emblem_to_display: function(display) {
        let emblem = new ShortcutEmblem({
            style_class: this.params.shortcut_style,
            display: display
        });
        display.shortcut = emblem;
    },

    _stop_lazy_load: function() {
        if(this._load_id !== 0) {
            GLib.source_remove(this._load_id);
            this._load_id = 0;
            this.emit('loading-stop');
        }

        this._load_state = LOAD_STATES.FINISHED;
        this._n_loaded = 0;
    },

    _lazy_load_items: function() {
        this._stop_lazy_load();

        this._load_state = LOAD_STATES.STARTED;
        this._load_id = GLib.idle_add(
            GLib.PRIORITY_LOW,
            Lang.bind(this, this._load_items)
        );
    },

    _load_items: function() {
        if(
            this._load_state !== LOAD_STATES.STARTED
            && this._load_state !== LOAD_STATES.LOADING
        ) {
            this._load_id = 0;
            return false;
        }

        if(this._n_loaded >= this._model.length) {
            LOAD_STATES.FINISHED;
            this.emit('loading-finish');
            this._load_id = 0;
            return false;
        }

        if(this._n_loaded === 0) {
            this._load_state = LOAD_STATES.LOADING;
            this.emit('loading-start');
        }

        for(let i = 0; i < this._n_load_at_once; i++) {
            if(this._n_loaded >= this._model.length) break;
            this._add_item(this._n_loaded);
            this._n_loaded++;
        }

        if(this._n_loaded === this._model.length) {
            this._load_state = LOAD_STATES.FINISHED;
            this._n_loaded = 0;
            this._load_id = 0;
            this.emit('loading-finish');
            return false;
        }
        else {
            this.emit('loading-continue');
            return true;
        }
    },

    _add_item: function(item_id) {
        let renderer = new this.renderer();
        let display = renderer.get_display(this.model, item_id);
        if(!display) return;

        this._box.insert_child_at_index(display, item_id);
        this._connect_display_signals(display);
        this._displays.push(display);
        this._add_shortcut_emblem_to_display(display);
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

    show_shortcuts: function() {
        let current_number = 1;

        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];

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

    hide_shortcuts: function() {
        for(let i = 0; i < this._displays.length; i++) {
            let display = this._displays[i];
            display.shortcut.hide();
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
        this._stop_lazy_load();
        this._displays = [];
        this._box.destroy_all_children();
    },

    destroy: function() {
        this._stop_lazy_load();
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

    get n_loaded_items() {
        return this._displays.length;
    }
});
Signals.addSignalMethods(ListView.prototype);
