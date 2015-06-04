const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const PULSE_TIMEOUT_MS = 70;

const GPasteProgressBar = new Lang.Class({
    Name: "GPasteProgressBar",

    _init: function(params) {
        this._params = Params.parse(params, {
            box_style_class: 'gpaste-progress-bar-box',
            progress_style_class: 'gpaste-progress-bar',
            animation_time: 0.7,
            pulse_mode: false,
            pulse_step: 3,
            expand: false,
            x_fill: false,
            y_fill: true,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

        this.actor = new St.Table({
            style_class: this._params.box_style_class,
            homogeneous: false
        });

        this._pulse_mode = this._params.pulse_mode;
        this._reverse_pulse = false;
        this._pulse_source_id = 0;
        this.visible = true;
        this._progress_bar = new St.BoxLayout({
            style_class: this._params.progress_style_class
        });

        this.actor.add(this._progress_bar, {
            row: 0,
            col: 0,
            expand: this._params.expand,
            x_fill: this._params.x_fill,
            y_fill: this._params.y_fill,
            x_align: this._params.x_align,
            y_align: this._params.y_align
        });

        this.reset();
    },

    _pulse: function() {
        let x;

        if(this._reverse_pulse) {
            x = this._progress_bar.translation_x - this._params.pulse_step;
            if(x <= 0) this._reverse_pulse = false;
        }
        else {
            let box_border = this.actor.get_theme_node().get_length('border');
            let progress_border = this.actor.get_theme_node().get_length('border');
            let max_x = (
                this.actor.width -
                this._progress_bar.width -
                box_border -
                progress_border
            );

            x = this._progress_bar.translation_x + this._params.pulse_step;
            if(x >= max_x) this._reverse_pulse = true;
        }

        this._progress_bar.translation_x = x;
        return GLib.SOURCE_CONTINUE;
    },

    set_progress_percents: function(percents) {
        let box_border = this.actor.get_theme_node().get_length('border');
        let progress_border = this.actor.get_theme_node().get_length('border');
        let width = Math.round(this.actor.width / 100 * percents - box_border - progress_border);

        Tweener.removeTweens(this._progress_bar);
        Tweener.addTween(this._progress_bar, {
            time: this._params.animation_time,
            transition: 'easeOutQuad',
            width: width
        });
    },

    reset: function() {
        this._progress_bar.width = 0;
        this.stop();
    },

    destroy: function() {
        this.stop();
        this.actor.destroy();
        this._params = null;
    },

    start: function() {
        if(!this.pulse_mode) return;

        this._progress_bar.width = Math.round(this.actor.width / 5);
        this._pulse_source_id = Mainloop.timeout_add(
            PULSE_TIMEOUT_MS,
            Lang.bind(this, this._pulse)
        );
    },

    stop: function() {
        this._progress_bar.width = 0;
        this._progress_bar.translation_x = 0;
        this._reverse_pulse = false;

        if(this._pulse_source_id !== 0) {
            Mainloop.source_remove(this._pulse_source_id);
            this._pulse_source_id = 0;
        }
    },

    show: function() {
        if(this.visible) return;

        this.visible = true;
        this.actor.opacity = 0;
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: 0.3,
            transition: 'easeOutQuad',
            opacity: 255
        });
    },

    hide: function() {
        if(!this.visible) return;

        this.visible = false;

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: 0.3,
            transition: 'easeOutQuad',
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.stop();
            })
        });
    },

    get pulse_mode() {
        return this._pulse_mode;
    },

    set pulse_mode(pulse_mode) {
        this.reset();
        this._pulse_mode = pulse_mode;
    }
});
